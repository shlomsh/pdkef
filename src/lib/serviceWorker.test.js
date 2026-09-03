import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { PRECACHED_FONTS, shouldPrecache } from '../../scripts/precacheFilter.mjs';

const workerSource = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');

function requestUrl(request) {
  return typeof request === 'string' ? new URL(request, 'https://pdkef.test').href : request.url;
}

// A minimal, in-memory stand-in for IndexedDB - this repo has no real
// IndexedDB test harness (see draftStore.test.js's header comment) and does
// not depend on fake-indexeddb, so the share-target tests below get just
// enough of the API surface openDraftsDb()/saveShareHandoff() in sw.js
// actually calls: open() with onupgradeneeded/onsuccess, a db whose
// transaction()/objectStore()/put() resolve on oncomplete. Every callback
// fires from a microtask, same relative ordering as the real thing, so
// sw.js's own promise-wrapping code (which attaches its handlers
// synchronously right after calling into this) sees them.
function createFakeIndexedDB() {
  const store = new Map();
  const indexedDB = {
    store,
    open: () => {
      const request = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          transaction: () => {
            const tx = { oncomplete: null, onabort: null, onerror: null };
            tx.objectStore = () => ({
              put: (value) => {
                store.set(value.tool, value);
                queueMicrotask(() => tx.oncomplete && tx.oncomplete());
              },
            });
            return tx;
          },
          close: () => {},
        };
        request.result = db;
        request.onsuccess && request.onsuccess();
      });
      return request;
    },
  };
  return indexedDB;
}

function createWorker(fetchImpl = vi.fn(), cacheKeys = ['pdkef-previous'], indexedDBImpl = createFakeIndexedDB()) {
  const listeners = new Map();
  const entries = new Map();
  const cache = {
    match: vi.fn(async (request) => entries.get(requestUrl(request))),
    put: vi.fn(async (request, response) => entries.set(requestUrl(request), response)),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => cacheKeys),
    delete: vi.fn(async () => true),
  };
  const self = {
    location: { origin: 'https://pdkef.test' },
    addEventListener: (name, listener) => listeners.set(name, listener),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
    registration: { unregister: vi.fn(async () => true) },
  };

  vm.runInNewContext(workerSource, {
    self,
    caches,
    fetch: fetchImpl,
    indexedDB: indexedDBImpl,
    Request,
    Response,
    URL,
    Promise,
    Error,
    Array,
    console,
  });

  return { cache, caches, entries, fetchImpl, indexedDB: indexedDBImpl, listeners, self };
}

async function dispatchInstall(worker) {
  const waits = [];
  worker.listeners.get('install')({ waitUntil: (promise) => waits.push(Promise.resolve(promise)) });
  return Promise.all(waits);
}

async function dispatchActivate(worker) {
  const waits = [];
  worker.listeners.get('activate')({ waitUntil: (promise) => waits.push(Promise.resolve(promise)) });
  return Promise.all(waits);
}

function manifestResponder(urls, perUrl = () => new Response('asset')) {
  return vi.fn(async (request) => {
    const url = requestUrl(request);
    if (url.endsWith('/precache-manifest.json')) return new Response(JSON.stringify({ urls }));
    return perUrl(new URL(url).pathname);
  });
}

async function dispatchFetch(worker, request) {
  /** @type {Promise<Response>} */
  let responsePromise;
  const background = [];
  worker.listeners.get('fetch')({
    request,
    respondWith: (promise) => { responsePromise = Promise.resolve(promise); },
    waitUntil: (promise) => background.push(Promise.resolve(promise)),
  });
  return { response: await responsePromise, background };
}

describe('offline-first service worker', () => {
  it('precaches the manifest without claiming pages from the previous build', async () => {
    const worker = createWorker(manifestResponder(['/', '/sign/', '/_astro/app.js']));

    await dispatchInstall(worker);

    expect(Array.from(worker.entries.keys()).sort()).toEqual([
      'https://pdkef.test/',
      'https://pdkef.test/_astro/app.js',
      'https://pdkef.test/sign/',
    ]);
    // skipWaiting would activate over pages still running the old build, whose
    // cache activate then deletes while they are lazy-importing from it.
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('keeps installing when individual assets fail, so one bad response is not fatal', async () => {
    const worker = createWorker(manifestResponder(
      ['/', '/sign/', '/fonts/heebo.ttf'],
      (pathname) => (pathname === '/fonts/heebo.ttf' ? new Response('nope', { status: 503 }) : new Response('asset')),
    ));

    await dispatchInstall(worker);

    expect(Array.from(worker.entries.keys()).sort()).toEqual([
      'https://pdkef.test/',
      'https://pdkef.test/sign/',
    ]);
    expect(worker.self.registration.unregister).not.toHaveBeenCalled();
  });

  it('fails the install when the offline fallback itself cannot be cached', async () => {
    const worker = createWorker(manifestResponder(
      ['/', '/sign/'],
      (pathname) => (pathname === '/' ? new Response('nope', { status: 500 }) : new Response('asset')),
    ));

    await expect(dispatchInstall(worker)).rejects.toThrow(/Failed to precache \//);
  });

  it('uninstalls itself and drops its caches when the origin serves no build', async () => {
    const worker = createWorker(
      vi.fn(async () => new Response('not found', { status: 404 })),
      ['pdkef-previous', 'some-other-app'],
    );

    await dispatchInstall(worker);

    expect(worker.self.registration.unregister).toHaveBeenCalledOnce();
    expect(worker.caches.delete).toHaveBeenCalledWith('pdkef-previous');
    expect(worker.caches.delete).not.toHaveBeenCalledWith('some-other-app');
  });

  it('only ever deletes its own caches on activate', async () => {
    const worker = createWorker(vi.fn(), ['pdkef-previous', 'some-other-app']);

    await dispatchActivate(worker);

    expect(worker.caches.delete).toHaveBeenCalledWith('pdkef-previous');
    expect(worker.caches.delete).not.toHaveBeenCalledWith('some-other-app');
    expect(worker.self.clients.claim).toHaveBeenCalledOnce();
  });

  it('serves a cached pathname for a query-route navigation while refreshing in the background', async () => {
    const fetchImpl = vi.fn(async () => new Response('fresh sign page'));
    const worker = createWorker(fetchImpl);
    worker.entries.set('https://pdkef.test/sign/', new Response('cached sign page'));
    const request = { method: 'GET', mode: 'navigate', url: 'https://pdkef.test/sign/?action=open' };

    const { response, background } = await dispatchFetch(worker, request);
    expect(await response.text()).toBe('cached sign page');
    expect(fetchImpl).toHaveBeenCalledWith(request);

    await Promise.all(background);
    expect(await worker.entries.get('https://pdkef.test/sign/').text()).toBe('fresh sign page');
  });

  it('falls back to the cached root when an uncached navigation has no network', async () => {
    const worker = createWorker(vi.fn(async () => { throw new Error('offline'); }));
    worker.entries.set('https://pdkef.test/', new Response('cached home'));

    const { response } = await dispatchFetch(worker, {
      method: 'GET',
      mode: 'navigate',
      url: 'https://pdkef.test/new-route/',
    });

    expect(await response.text()).toBe('cached home');
  });
});

/**
 * DEMO-03: Web Share Target has no server to answer the POST Android's share
 * sheet sends (see manifest.webmanifest's share_target), so this worker is
 * the only thing that ever sees the shared file. It must lift the bytes out
 * of the multipart body into the exact IndexedDB handoff record
 * draftStore.js's saveHandoff('sign', ...) already writes (same DB/store/key
 * shape), so the Sign tool's existing takeHandoff('sign') mount-time restore
 * - the same path FileDropzone's home-page drop already feeds - picks it up
 * with no changes on that side, and never touch the network with the file.
 */
describe('Web Share Target (DEMO-03)', () => {
  function shareRequest(formData) {
    return {
      method: 'POST',
      mode: 'navigate',
      url: 'https://pdkef.test/share-target/',
      formData: async () => formData,
    };
  }

  it('stores a shared PDF as the Sign tool handoff record and redirects there', async () => {
    const worker = createWorker();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const formData = new FormData();
    formData.set('pdf', new File([bytes], 'contract.pdf', { type: 'application/pdf' }));

    const { response } = await dispatchFetch(worker, shareRequest(formData));

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://pdkef.test/sign/');

    const record = worker.indexedDB.store.get('handoff:sign');
    expect(record.fileName).toBe('contract.pdf');
    expect(record.fileType).toBe('application/pdf');
    expect(new Uint8Array(record.fileBytes)).toEqual(bytes);
    expect(typeof record.savedAt).toBe('number');
  });

  it('defaults name/type when the shared file omits them, rather than dropping it', async () => {
    const worker = createWorker();
    const formData = new FormData();
    formData.set('pdf', new File([new Uint8Array([9])], '', { type: '' }));

    await dispatchFetch(worker, shareRequest(formData));

    const record = worker.indexedDB.store.get('handoff:sign');
    expect(record.fileName).toBe('shared.pdf');
    expect(record.fileType).toBe('application/pdf');
  });

  it('still redirects to the Sign tool when the share carried no usable file', async () => {
    const worker = createWorker();

    const { response } = await dispatchFetch(worker, shareRequest(new FormData()));

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://pdkef.test/sign/');
    expect(worker.indexedDB.store.size).toBe(0);
  });

  it('redirects rather than throwing when the POST body cannot be read', async () => {
    const worker = createWorker();
    const request = {
      method: 'POST',
      mode: 'navigate',
      url: 'https://pdkef.test/share-target/',
      formData: async () => {
        throw new Error('bad multipart body');
      },
    };

    const { response } = await dispatchFetch(worker, request);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://pdkef.test/sign/');
  });

  it('never intercepts a POST to any other path, leaving normal request handling to the browser', async () => {
    const worker = createWorker();
    const request = { method: 'POST', mode: 'navigate', url: 'https://pdkef.test/some-other-path/' };

    const { response } = await dispatchFetch(worker, request);

    // Nothing in the fetch handler calls event.respondWith for this request
    // (POST falls straight through the GET-only branch below it too), so the
    // browser's own default handling applies untouched.
    expect(response).toBeUndefined();
  });
});

/**
 * SIGN-07: installation precaches the whole app (every page and script,
 * every font except the default) so any advertised workflow can be opened
 * and used offline after a single visit. A service worker can never
 * intercept the navigation that registers it, so a page's own first load -
 * including a `client:load` island's hydration bundle - is never cached by
 * that visit; precaching everything up front is what closes that gap
 * instead of requiring a second online visit per route. See
 * precacheFilter.mjs's doc comment for the full reasoning and the
 * pre-2026-08-27 precedent this restores.
 */
describe('precache manifest delivery policy', () => {
  const names = { manifestName: 'precache-manifest.json', workerName: 'sw.js' };

  it('leaves the font catalogue out, so a visitor does not download faces they never pick', () => {
    expect(shouldPrecache('fonts/Pacifico-Regular.ttf', names)).toBe(false);
    expect(shouldPrecache('fonts/Kalam-Bold.ttf', names)).toBe(false);
    expect(shouldPrecache('fonts/NotoSansJP-Regular.ttf', names)).toBe(false);
  });

  it('keeps the default family, because a first-ever offline session has no font to embed otherwise', () => {
    // DEFAULT_FAMILY in src/editor/text/fonts.js. Without this one file, signPdf's
    // fetch fails offline, loadCustomFont returns null, and serialize throws
    // rather than degrading to something upright.
    expect(PRECACHED_FONTS).toEqual(['fonts/Arimo-Regular.ttf']);
    expect(shouldPrecache('fonts/Arimo-Regular.ttf', names)).toBe(true);
  });

  it('precaches every page and script, documentation included, because a page shell alone cannot hydrate', () => {
    expect(shouldPrecache('index.html', names)).toBe(true);
    expect(shouldPrecache('sign/index.html', names)).toBe(true);
    expect(shouldPrecache('pdf-to-image/index.html', names)).toBe(true);
    expect(shouldPrecache('redact/index.html', names)).toBe(true);
    expect(shouldPrecache('merge/index.html', names)).toBe(true);
    expect(shouldPrecache('image-to-pdf/index.html', names)).toBe(true);
    expect(shouldPrecache('split/index.html', names)).toBe(true);
    expect(shouldPrecache('compress/index.html', names)).toBe(true);
    expect(shouldPrecache('unlock/index.html', names)).toBe(true);
    expect(shouldPrecache('edit-pdf/index.html', names)).toBe(true);
    expect(shouldPrecache('install-pdf-app/index.html', names)).toBe(true);
    expect(shouldPrecache('open-source-pdf-editor/index.html', names)).toBe(true);
    expect(shouldPrecache('how-to-sign-a-pdf-on-iphone/index.html', names)).toBe(true);
    expect(shouldPrecache('blur-vs-blackout-vs-delete-pdf/index.html', names)).toBe(true);
    expect(shouldPrecache('future-documentation-page/index.html', names)).toBe(true);
    expect(shouldPrecache('de/pdf-unterschreiben/index.html', names)).toBe(true);
    expect(shouldPrecache('_astro/pdf.worker.min.abc123.mjs', names)).toBe(true);
    expect(shouldPrecache('_astro/PdfToImageTool.abc123.js', names)).toBe(true);
  });

  it('never caches the manifest or the worker as entries in their own manifest', () => {
    // A 404 on the manifest is what tells an orphaned worker to uninstall, so
    // caching either of these would defeat that.
    expect(shouldPrecache('precache-manifest.json', names)).toBe(false);
    expect(shouldPrecache('sw.js', names)).toBe(false);
  });

  it('caches a font on first use, which is what makes leaving it out of the precache safe', async () => {
    const worker = createWorker(vi.fn(async () => new Response('font bytes')));
    const request = { method: 'GET', mode: 'no-cors', url: 'https://pdkef.test/fonts/Pacifico-Regular.ttf' };

    const { response } = await dispatchFetch(worker, request);

    expect(await response.text()).toBe('font bytes');
    expect(worker.entries.has('https://pdkef.test/fonts/Pacifico-Regular.ttf')).toBe(true);
  });
});
