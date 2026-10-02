import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { minifyServiceWorker } from './minifyServiceWorker.mjs';

const workerSource = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');
// The CRITICAL_VERSION this repo ships (MEM-13). Tests derive "plain" and "critical" builds from
// it, so bumping it for a real fix needs no test edit.
const SHIPPED_CRITICAL = Number(/const CRITICAL_VERSION = (\d+);/.exec(workerSource)[1]);
const minifiedWorkerSource = minifyServiceWorker(workerSource);

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

function createWorker(fetchImpl = vi.fn(), cacheKeys = ['pdkef-previous'], indexedDBImpl = createFakeIndexedDB(), source = workerSource, criticalVersion = SHIPPED_CRITICAL) {
  const listeners = new Map();
  const currentCacheKey = `pdkef-c${criticalVersion}-__BUILD_ID__`;
  const cacheNames = new Set(cacheKeys);
  const entriesByCache = new Map(cacheKeys.map((key) => [key, new Map()]));
  const cacheObjects = new Map();
  const cacheFor = (key) => {
    cacheNames.add(key);
    if (!entriesByCache.has(key)) entriesByCache.set(key, new Map());
    if (!cacheObjects.has(key)) {
      const entries = entriesByCache.get(key);
      cacheObjects.set(key, {
        match: vi.fn(async (request) => entries.get(requestUrl(request))?.clone()),
        put: vi.fn(async (request, response) => entries.set(requestUrl(request), response.clone())),
        keys: vi.fn(async () => [...entries.keys()].map((url) => new Request(url))),
      });
    }
    return cacheObjects.get(key);
  };
  const cache = cacheFor(currentCacheKey);
  const entries = entriesByCache.get(currentCacheKey);
  const caches = {
    open: vi.fn(async (key) => cacheFor(key)),
    keys: vi.fn(async () => [...cacheNames]),
    delete: vi.fn(async (key) => {
      const existed = cacheNames.delete(key);
      entriesByCache.delete(key);
      cacheObjects.delete(key);
      return existed;
    }),
  };
  const self = {
    location: { origin: 'https://pdkef.test' },
    addEventListener: (name, listener) => listeners.set(name, listener),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => []) },
    registration: { unregister: vi.fn(async () => true) },
    navigator: { onLine: true },
  };

  const context = {
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
    MessageChannel,
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
  };
  vm.runInNewContext(source, context);

  return { cache, caches, context, entries, entriesByCache, fetchImpl, indexedDB: indexedDBImpl, listeners, self };
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

// Waits for every waitUntil, including ones registered while earlier ones run.
async function awaitAll(waits) {
  for (let done = 0; done < waits.length;) {
    const upTo = waits.length;
    await Promise.all(waits.slice(done, upTo));
    done = upTo;
  }
}

async function dispatchMessage(worker, data) {
  const waits = [];
  let reply;
  worker.listeners.get('message')({
    data,
    ports: [{ postMessage: (value) => { reply = value; } }],
    waitUntil: (promise) => waits.push(Promise.resolve(promise)),
  });
  await awaitAll(waits);
  return reply;
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
      'https://pdkef.test/__pdkef/precache-complete/',
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

  it('provisions every face in a requested family before reporting it ready offline', async () => {
    const worker = createWorker(vi.fn(async (request) => new Response(`bytes:${new URL(request.url).pathname}`)));
    const pack = {
      family: 'Scheherazade New',
      urls: ['/fonts/ScheherazadeNew-Regular.ttf', '/fonts/ScheherazadeNew-Bold.ttf'],
    };

    expect(await dispatchMessage(worker, { type: 'pdkef:font-pack-status', packs: [pack] }))
      .toEqual({ ok: true, ready: { 'Scheherazade New': false } });

    expect(await dispatchMessage(worker, { type: 'pdkef:font-pack-provision', packs: [pack] }))
      .toEqual({ ok: true, ready: { 'Scheherazade New': true } });
    expect([...worker.entries.keys()]).toEqual(expect.arrayContaining([
      'https://pdkef.test/fonts/ScheherazadeNew-Regular.ttf',
      'https://pdkef.test/fonts/ScheherazadeNew-Bold.ttf',
      'https://pdkef.test/__pdkef/offline-font-pack/Scheherazade%20New',
    ]));
  });

  it('does not claim a partial family is ready when one face cannot be downloaded', async () => {
    const worker = createWorker(vi.fn(async (request) => (
      request.url.endsWith('Bold.ttf') ? new Response('missing', { status: 503 }) : new Response('regular')
    )));
    const pack = {
      family: 'Noto Sans Bengali',
      urls: ['/fonts/NotoSansBengali-Regular.ttf', '/fonts/NotoSansBengali-Bold.ttf'],
    };

    const result = await dispatchMessage(worker, { type: 'pdkef:font-pack-provision', packs: [pack] });

    expect(result.ok).toBe(false);
    expect(worker.entries.has('https://pdkef.test/__pdkef/offline-font-pack/Noto%20Sans%20Bengali')).toBe(false);
  });

  // LOC-02: locale packs. HTML only, one edition per request, and never
  // anything outside that edition's prefix.
  it('provisions every published page of an edition and reports it ready', async () => {
    const worker = createWorker(vi.fn(async (request) => new Response(`page:${new URL(request.url).pathname}`)));
    const pack = { prefix: 'he', urls: ['/he/merge/', '/he/compress/', '/he/how-to-sign-a-pdf-on-android/'] };

    expect(await dispatchMessage(worker, { type: 'pdkef:locale-pack-status', packs: [pack] }))
      .toEqual({ ok: true, ready: { he: false } });
    expect(await dispatchMessage(worker, { type: 'pdkef:locale-pack-provision', packs: [pack] }))
      .toEqual({ ok: true, ready: { he: true } });
    expect([...worker.entries.keys()]).toEqual(expect.arrayContaining([
      'https://pdkef.test/he/merge/',
      'https://pdkef.test/he/compress/',
      'https://pdkef.test/he/how-to-sign-a-pdf-on-android/',
      'https://pdkef.test/__pdkef/offline-locale-pack/he',
    ]));

    // A provisioned page then serves offline on its first navigation, the
    // whole point of warming it: same cache key the navigation handler reads.
    worker.fetchImpl.mockRejectedValue(new Error('offline'));
    const { response } = await dispatchFetch(worker, { method: 'GET', mode: 'navigate', url: 'https://pdkef.test/he/compress/' });
    expect(await response.text()).toBe('page:/he/compress/');
  });

  it('refuses a pack that names a page outside its own edition, and caches nothing from it', async () => {
    const worker = createWorker(vi.fn(async () => new Response('page')));
    const result = await dispatchMessage(worker, {
      type: 'pdkef:locale-pack-provision',
      packs: [{ prefix: 'he', urls: ['/he/merge/', '/merge/'] }],
    });
    expect(result.ok).toBe(false);
    expect(worker.fetchImpl).not.toHaveBeenCalled();
    expect(worker.entries.size).toBe(0);
  });

  it('does not report an edition ready when one of its pages cannot be fetched', async () => {
    const worker = createWorker(vi.fn(async (request) => (
      request.url.endsWith('/he/compress/') ? new Response('gone', { status: 404 }) : new Response('page')
    )));
    const result = await dispatchMessage(worker, {
      type: 'pdkef:locale-pack-provision',
      packs: [{ prefix: 'he', urls: ['/he/merge/', '/he/compress/'] }],
    });
    expect(result.ok).toBe(false);
    expect(worker.entries.has('https://pdkef.test/__pdkef/offline-locale-pack/he')).toBe(false);
  });

  it('revalidates provisioned font packs into an upgraded cache before deleting the old cache', async () => {
    const worker = createWorker(vi.fn(async (request) => new Response(`fresh:${new URL(request.url).pathname}`)));
    const oldEntries = worker.entriesByCache.get('pdkef-previous');
    const pack = {
      family: 'Noto Sans SC',
      urls: ['/fonts/NotoSansSC-Regular.ttf', '/fonts/NotoSansSC-Bold.ttf'],
    };
    oldEntries.set(
      'https://pdkef.test/__pdkef/offline-font-pack/Noto%20Sans%20SC',
      new Response(JSON.stringify(pack)),
    );
    oldEntries.set('https://pdkef.test/fonts/NotoSansSC-Regular.ttf', new Response('old regular'));
    oldEntries.set('https://pdkef.test/fonts/NotoSansSC-Bold.ttf', new Response('old bold'));

    await dispatchActivate(worker);

    expect(await worker.entries.get('https://pdkef.test/fonts/NotoSansSC-Regular.ttf').text())
      .toBe('fresh:/fonts/NotoSansSC-Regular.ttf');
    expect(worker.entries.has('https://pdkef.test/__pdkef/offline-font-pack/Noto%20Sans%20SC')).toBe(true);
    expect(worker.caches.delete).toHaveBeenCalledWith('pdkef-previous');
  });

  it('retains provisioned faces during an offline activation instead of silently dropping the pack', async () => {
    const worker = createWorker(vi.fn(async () => { throw new Error('offline'); }));
    const oldEntries = worker.entriesByCache.get('pdkef-previous');
    const pack = { family: 'Anek Telugu', urls: ['/fonts/AnekTelugu-Regular.ttf'] };
    oldEntries.set(
      'https://pdkef.test/__pdkef/offline-font-pack/Anek%20Telugu',
      new Response(JSON.stringify(pack)),
    );
    oldEntries.set('https://pdkef.test/fonts/AnekTelugu-Regular.ttf', new Response('retained bytes'));

    await dispatchActivate(worker);

    expect(await worker.entries.get('https://pdkef.test/fonts/AnekTelugu-Regular.ttf').text())
      .toBe('retained bytes');
    expect(worker.entries.has('https://pdkef.test/__pdkef/offline-font-pack/Anek%20Telugu')).toBe(true);
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
 * src/site-lib/precachePolicy.js's doc comment for the full reasoning and
 * the pre-2026-08-27 precedent this restores.
 *
 * ARCH-22: the shouldPrecache()/PRECACHED_FONTS cases that used to live here
 * moved to src/site-lib/precachePolicy.test.js, next to the policy they
 * test - they never touch public/sw.js. What's left here is this file's own
 * job: sw.js's actual fetch handler caches a font it was not told to
 * precache, on first use, which is what makes leaving it out safe.
 */
describe('precache manifest delivery policy', () => {
  it('caches a font on first use, which is what makes leaving it out of the precache safe', async () => {
    const worker = createWorker(vi.fn(async () => new Response('font bytes')));
    const request = { method: 'GET', mode: 'no-cors', url: 'https://pdkef.test/fonts/Pacifico-Regular.ttf' };

    const { response } = await dispatchFetch(worker, request);

    expect(await response.text()).toBe('font bytes');
    expect(worker.entries.has('https://pdkef.test/fonts/Pacifico-Regular.ttf')).toBe(true);
  });
});

// The minified copy is what actually ships in dist/sw.js (see
// generate-precache-manifest.mjs). It must stay a valid classic worker
// script, keep the __BUILD_ID__ placeholder for that same script to
// substitute, and never gain a skipWaiting() call the minifier didn't put
// there (see the skipWaiting() invariant in csp-scripts-pwa.md): the MEM-10
// grant and MEM-13's gated force are the only two.
describe('minified service worker', () => {
  it('evaluates in the same harness and keeps the invariants that matter', async () => {
    const worker = createWorker(vi.fn(async () => new Response('font bytes')), ['pdkef-previous'], createFakeIndexedDB(), minifiedWorkerSource);
    const request = { method: 'GET', mode: 'no-cors', url: 'https://pdkef.test/fonts/Pacifico-Regular.ttf' };

    const { response } = await dispatchFetch(worker, request);

    expect(await response.text()).toBe('font bytes');
    expect(minifiedWorkerSource).toContain('__BUILD_ID__');
    expect(minifiedWorkerSource.match(/skipWaiting\s*\(/g)).toHaveLength(2);
    expect(minifiedWorkerSource.length).toBeLessThan(workerSource.length * 0.6);
  });
});

// A fake open tab. `behavior` scripts its answer to the busy survey: 'busy',
// 'idle', or 'never' (a frozen tab, or a page from before MEM-10).
const realSetTimeout = setTimeout;
const settle = () => new Promise((resolve) => realSetTimeout(resolve, 20));
const fakeWindow = (id, behavior = 'idle', url = `https://pdkef.test/${id}/`) => ({
  id,
  url,
  postMessage: vi.fn((_message, ports) => {
    if (behavior === 'never') return;
    ports[0].postMessage({ busy: behavior === 'busy' });
  }),
});

// Runs `start()` under fake timers, lets real MessagePort replies land, then
// jumps past every worker timeout so a window that never answers costs no real time.
async function withSilentTimeouts(start) {
  vi.useFakeTimers();
  try {
    const pending = start();
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    return await pending;
  } finally {
    vi.useRealTimers();
  }
}

// A worker with no readiness marker and a three-URL manifest, '/' and '/sign/' already cached.
// `failing` lists pathnames that answer 503. Returns the worker and its fetched pathnames.
function buildIncompleteWorker(source, windows, failing = []) {
  const fetched = [];
  const fetchImpl = vi.fn(async (request) => {
    const url = requestUrl(request);
    if (url.endsWith('/precache-manifest.json')) return new Response(JSON.stringify({ urls: ['/', '/sign/', '/_astro/app.js'] }));
    const pathname = new URL(url).pathname;
    fetched.push(pathname);
    return failing.includes(pathname) ? new Response('no', { status: 503 }) : new Response('asset');
  });
  const worker = createWorker(fetchImpl, ['pdkef-previous'], createFakeIndexedDB(), source);
  worker.self.clients.matchAll = vi.fn(async () => windows);
  worker.entries.set('https://pdkef.test/', new Response('home'));
  worker.entries.set('https://pdkef.test/sign/', new Response('sign'));
  return { worker, fetched };
}
const PRECACHE_MARKER = 'https://pdkef.test/__pdkef/precache-complete/';

// MEM-10: skipWaiting() runs only on the active worker's message, after every tab answered.
describe.each([['source', workerSource], ['minified source', minifiedWorkerSource]])('skip-waiting message (%s)', (_label, source) => {
  const SKIP = 'pdkef:skip-waiting';
  const build = (windows) => {
    const worker = createWorker(vi.fn(async () => new Response('x')), ['pdkef-previous'], createFakeIndexedDB(), source);
    worker.self.clients.matchAll = vi.fn(async () => windows);
    worker.entries.set('https://pdkef.test/__pdkef/precache-complete/', new Response('ok'));
    return worker;
  };

  it('skips waiting and replies ok when every window is idle', async () => {
    const worker = build([fakeWindow('a'), fakeWindow('b')]);
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: true, ready: true, windows: 2, busy: 0, silent: 0 });
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('asks each window with a busy-query and a reply port', async () => {
    const a = fakeWindow('a');
    await dispatchMessage(build([a]), { type: SKIP });
    expect(a.postMessage).toHaveBeenCalledWith({ type: 'pdkef:busy-query' }, [expect.anything()]);
  });

  it('refuses when one window is busy', async () => {
    const worker = build([fakeWindow('a'), fakeWindow('b', 'busy')]);
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: false, ready: true, windows: 2, busy: 1, silent: 0 });
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('refuses when one window never answers', async () => {
    const worker = build([fakeWindow('a'), fakeWindow('b', 'never')]);
    const reply = await withSilentTimeouts(() => dispatchMessage(worker, { type: SKIP }));
    expect(reply).toEqual({ ok: false, ready: true, windows: 2, busy: 0, silent: 1 });
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('does not ask or count blob: windows', async () => {
    const blob = fakeWindow('blob', 'busy', 'blob:https://pdkef.test/abc');
    const worker = build([fakeWindow('a'), blob]);
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: true, ready: true, windows: 1, busy: 0, silent: 0 });
    expect(blob.postMessage).not.toHaveBeenCalled();
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('refuses without asking any window when the build is not fully precached', async () => {
    const a = fakeWindow('a');
    const worker = build([a]);
    worker.entries.delete('https://pdkef.test/__pdkef/precache-complete/');
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: false, ready: false, windows: 0, busy: 0, silent: 0 });
    expect(a.postMessage).not.toHaveBeenCalled();
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('refuses without asking any window while offline', async () => {
    const a = fakeWindow('a');
    const worker = build([a]);
    worker.self.navigator.onLine = false;
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: false, ready: false, windows: 0, busy: 0, silent: 0 });
    expect(a.postMessage).not.toHaveBeenCalled();
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('posts the reply before it calls skipWaiting', async () => {
    const worker = build([fakeWindow('a')]);
    const order = [];
    worker.self.skipWaiting = vi.fn(async () => { order.push('skipWaiting'); });
    const waits = [];
    worker.listeners.get('message')({
      data: { type: SKIP },
      ports: [{ postMessage: () => order.push('reply') }],
      waitUntil: (promise) => waits.push(Promise.resolve(promise)),
    });
    await Promise.all(waits);
    expect(order).toEqual(['reply', 'skipWaiting']);
  });

  it('while not ready and online, replies not-ready and fetches only the missing URLs, then marks complete', async () => {
    const { worker, fetched } = buildIncompleteWorker(source, [fakeWindow('a')]);
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: false, ready: false, windows: 0, busy: 0, silent: 0 });
    expect(fetched).toEqual(['/_astro/app.js']);
    expect(worker.entries.has(PRECACHE_MARKER)).toBe(true);
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: true, ready: true, windows: 1, busy: 0, silent: 0 });
  });

  it('writes no marker while a URL still fails', async () => {
    const { worker } = buildIncompleteWorker(source, [], ['/_astro/app.js']);
    await dispatchMessage(worker, { type: SKIP });
    expect(worker.entries.has(PRECACHE_MARKER)).toBe(false);
    expect((await dispatchMessage(worker, { type: SKIP })).ready).toBe(false);
  });

  it('fetches nothing while offline', async () => {
    const { worker, fetched } = buildIncompleteWorker(source, []);
    worker.self.navigator.onLine = false;
    await dispatchMessage(worker, { type: SKIP });
    expect(fetched).toEqual([]);
    expect(worker.entries.has(PRECACHE_MARKER)).toBe(false);
  });

  it('does not ask or count windows whose path is not a page (sitemap, robots)', async () => {
    const sitemap = fakeWindow('s', 'busy', 'https://pdkef.test/sitemap.xml');
    const robots = fakeWindow('r', 'busy', 'https://pdkef.test/robots.txt');
    const worker = build([fakeWindow('a'), sitemap, robots]);
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: true, ready: true, windows: 1, busy: 0, silent: 0 });
    expect(sitemap.postMessage).not.toHaveBeenCalled();
    expect(robots.postMessage).not.toHaveBeenCalled();
  });

  it('never skips waiting for a font-pack message', async () => {
    const worker = build([fakeWindow('a')]);
    await dispatchMessage(worker, { type: 'pdkef:font-pack-status' });
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('runs without a reply port and does not throw', async () => {
    const worker = build([fakeWindow('a')]);
    const waits = [];
    worker.listeners.get('message')({ data: { type: SKIP }, waitUntil: (p) => waits.push(Promise.resolve(p)) });
    await Promise.all(waits);
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });
});

describe.each([['source', workerSource], ['minified source', minifiedWorkerSource]])('install readiness marker (%s)', (_label, source) => {
  const MARKER = 'https://pdkef.test/__pdkef/precache-complete/';
  const install = async (perUrl) => {
    const worker = createWorker(manifestResponder(['/', '/sign/'], perUrl), ['pdkef-previous'], createFakeIndexedDB(), source);
    await dispatchInstall(worker);
    return worker;
  };

  it('is written when every URL precaches', async () => {
    expect((await install()).entries.has(MARKER)).toBe(true);
  });

  it('is not written when one URL misses', async () => {
    const worker = await install((pathname) => (pathname === '/sign/' ? new Response('no', { status: 503 }) : new Response('asset')));
    expect(worker.entries.has(MARKER)).toBe(false);
  });
});

describe.each([['source', workerSource], ['minified source', minifiedWorkerSource]])('update status message (%s)', (_label, source) => {
  const STATUS = 'pdkef:update-status';
  const build = (windows, marker = true) => {
    const worker = createWorker(vi.fn(async () => new Response('x')), ['pdkef-previous'], createFakeIndexedDB(), source);
    worker.self.clients.matchAll = vi.fn(async () => windows);
    if (marker) worker.entries.set('https://pdkef.test/__pdkef/precache-complete/', new Response('ok'));
    return worker;
  };
  const dispatchStatus = async (worker, sourceId) => {
    const waits = [];
    let reply;
    worker.listeners.get('message')({
      data: { type: STATUS },
      source: { id: sourceId },
      ports: [{ postMessage: (value) => { reply = value; } }],
      waitUntil: (promise) => waits.push(Promise.resolve(promise)),
    });
    await awaitAll(waits);
    return reply;
  };

  it('surveys every http(s) window except the asking one', async () => {
    const asker = fakeWindow('me', 'busy');
    const worker = build([asker, fakeWindow('a'), fakeWindow('b', 'busy'), fakeWindow('blob', 'busy', 'blob:https://pdkef.test/x')]);
    expect(await dispatchStatus(worker, 'me')).toEqual({ ready: true, windows: 2, busy: 1, silent: 0 });
    expect(asker.postMessage).not.toHaveBeenCalled();
  });

  it('counts a window that never answers as silent', async () => {
    const worker = build([fakeWindow('me'), fakeWindow('a', 'never')]);
    expect(await withSilentTimeouts(() => dispatchStatus(worker, 'me'))).toEqual({ ready: true, windows: 1, busy: 0, silent: 1 });
  });

  it('is not ready without the marker, and asks no window', async () => {
    const a = fakeWindow('a');
    expect(await dispatchStatus(build([a], false), 'me')).toEqual({ ready: false, windows: 0, busy: 0, silent: 0 });
    expect(a.postMessage).not.toHaveBeenCalled();
  });

  it('while not ready and online, completes the precache in the background and then reports ready', async () => {
    const { worker, fetched } = buildIncompleteWorker(source, [fakeWindow('a')]);
    expect(await dispatchStatus(worker, 'me')).toEqual({ ready: false, windows: 0, busy: 0, silent: 0 });
    expect(fetched).toEqual(['/_astro/app.js']);
    expect(await dispatchStatus(worker, 'me')).toEqual({ ready: true, windows: 1, busy: 0, silent: 0 });
  });

  it('leaves the build not ready while a URL still fails', async () => {
    const { worker } = buildIncompleteWorker(source, [], ['/_astro/app.js']);
    await dispatchStatus(worker, 'me');
    expect(worker.entries.has(PRECACHE_MARKER)).toBe(false);
  });

  it('fetches nothing for the missing URLs while offline', async () => {
    const { worker, fetched } = buildIncompleteWorker(source, []);
    worker.self.navigator.onLine = false;
    await dispatchStatus(worker, 'me');
    expect(fetched).toEqual([]);
  });

  it('does not ask or count non-page windows', async () => {
    const sitemap = fakeWindow('s', 'busy', 'https://pdkef.test/sitemap.xml');
    const worker = build([fakeWindow('a'), sitemap, fakeWindow('r', 'busy', 'https://pdkef.test/robots.txt')]);
    expect(await dispatchStatus(worker, 'me')).toEqual({ ready: true, windows: 1, busy: 0, silent: 0 });
    expect(sitemap.postMessage).not.toHaveBeenCalled();
  });

  it('is not ready offline, and asks no window', async () => {
    const a = fakeWindow('a');
    const worker = build([a]);
    worker.self.navigator.onLine = false;
    expect(await dispatchStatus(worker, 'me')).toEqual({ ready: false, windows: 0, busy: 0, silent: 0 });
    expect(a.postMessage).not.toHaveBeenCalled();
  });
});

describe.each([['source', workerSource], ['minified source', minifiedWorkerSource]])('silent takeover on navigation (%s)', (_label, source) => {
  const nav = { method: 'GET', mode: 'navigate', url: 'https://pdkef.test/sign/' };
  const build = ({ answer = { ok: true }, waiting = true } = {}) => {
    const worker = createWorker(vi.fn(async () => new Response('fresh')), ['pdkef-previous'], createFakeIndexedDB(), source);
    worker.entries.set('https://pdkef.test/sign/', new Response('cached sign page'));
    const postMessage = vi.fn((_data, ports) => { if (answer) ports[0].postMessage(answer); });
    if (waiting) worker.self.registration.waiting = { postMessage };
    return { worker, postMessage };
  };

  it('asks the waiting worker to take over and answers with the takeover page when it agrees', async () => {
    const { worker, postMessage } = build();
    const { response } = await dispatchFetch(worker, nav);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: 'pdkef:skip-waiting' }, [expect.anything()]);
    const html = await response.text();
    expect(html).toContain('http-equiv="refresh"');
    expect(html).not.toContain('<script');
    expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('falls through when the waiting worker refuses', async () => {
    const { worker } = build({ answer: { ok: false } });
    const { response } = await dispatchFetch(worker, nav);
    expect(await response.text()).toBe('cached sign page');
  });

  it('falls through when the waiting worker never replies', async () => {
    const { worker } = build({ answer: null });
    const { response } = await withSilentTimeouts(() => dispatchFetch(worker, nav));
    expect(await response.text()).toBe('cached sign page');
  });

  it('posts nothing without a waiting worker', async () => {
    const { worker, postMessage } = build({ waiting: false });
    const { response } = await dispatchFetch(worker, nav);
    expect(postMessage).not.toHaveBeenCalled();
    expect(await response.text()).toBe('cached sign page');
  });

  it('serves a second navigation within the cooldown normally, without asking again', async () => {
    const { worker, postMessage } = build();
    await dispatchFetch(worker, nav);
    const { response } = await dispatchFetch(worker, nav);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe('cached sign page');
  });

  it('posts nothing to the waiting worker while offline, and serves the cached page', async () => {
    const { worker, postMessage } = build();
    worker.self.navigator.onLine = false;
    const { response } = await dispatchFetch(worker, nav);
    expect(postMessage).not.toHaveBeenCalled();
    expect(await response.text()).toBe('cached sign page');
  });

  it('after a reply with unanswered tabs, a second navigation does not ask again', async () => {
    const { worker, postMessage } = build({ answer: { ok: false, ready: true, windows: 1, busy: 0, silent: 1 } });
    await dispatchFetch(worker, nav);
    await dispatchFetch(worker, nav);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it('after a reply with only busy tabs, a second navigation asks again', async () => {
    const { worker, postMessage } = build({ answer: { ok: false, ready: true, windows: 1, busy: 1, silent: 0 } });
    await dispatchFetch(worker, nav);
    await dispatchFetch(worker, nav);
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

});

// MEM-13: a build that bumped CRITICAL_VERSION takes over on its own, once every tab is ready.
// The critical sources are the same code with the constant raised, as a deploy that bumped it.
const bumpedSource = workerSource.replace(
  `const CRITICAL_VERSION = ${SHIPPED_CRITICAL};`,
  `const CRITICAL_VERSION = ${SHIPPED_CRITICAL + 1};`,
);
const criticalSources = [
  ['source', bumpedSource, workerSource],
  ['minified source', minifyServiceWorker(bumpedSource), minifiedWorkerSource],
];

describe.each(criticalSources)('critical version (%s)', (_label, criticalSource, plainSource) => {
  const { context } = createWorker(vi.fn(), ['pdkef-previous'], createFakeIndexedDB(), plainSource);

  it('reads the critical version out of a cache key, and an old key as 0', () => {
    expect(context.criticalVersionOf('pdkef-c0-abc123def456')).toBe(0);
    expect(context.criticalVersionOf('pdkef-c3-abc123def456')).toBe(3);
    expect(context.criticalVersionOf('pdkef-c12-abc123def456')).toBe(12);
    expect(context.criticalVersionOf('pdkef-abc123def456')).toBe(0);
    expect(context.criticalVersionOf('pdkef-previous')).toBe(0);
    expect(context.criticalVersionOf('some-other-app-c9-x')).toBe(0);
  });

  it('is critical only when strictly above the builds already cached', () => {
    expect(context.isCriticalOver(2, ['pdkef-c1-aaa'])).toBe(true);
    expect(context.isCriticalOver(1, ['pdkef-c1-aaa'])).toBe(false);
    expect(context.isCriticalOver(1, ['pdkef-c2-aaa'])).toBe(false);
    expect(context.isCriticalOver(1, ['pdkef-aaa', 'pdkef-bbb'])).toBe(true);
    expect(context.isCriticalOver(0, ['pdkef-aaa'])).toBe(false);
  });

  it('forces nothing when it is the only build, and compares against the build the tabs run', () => {
    expect(context.isCriticalOver(1, [])).toBe(false);
    // A waiting build that was never taken over leaves its newer cache behind.
    expect(context.isCriticalOver(1, ['pdkef-c0-active', 'pdkef-c1-stale-waiting'])).toBe(true);
  });

  const CHECK = { type: 'pdkef:critical-check' };
  const UPDATE = { type: 'pdkef:critical-update' };
  // A tab's answer to the critical-update message: at once, never, or when told.
  const criticalWindow = (id, behavior = 'ready', url = `https://pdkef.test/${id}/`) => {
    const window = {
      id,
      url,
      reply: null,
      postMessage: vi.fn((_message, ports) => {
        window.reply = () => ports[0].postMessage({ ready: true });
        if (behavior === 'ready') window.reply();
      }),
    };
    return window;
  };
  const build = ({ windows = [], waiting = true, marker = true, source = criticalSource, version = SHIPPED_CRITICAL + 1, keys = [`pdkef-c${SHIPPED_CRITICAL}-previous`] } = {}) => {
    const worker = createWorker(vi.fn(async () => new Response('x')), keys, createFakeIndexedDB(), source, version);
    worker.self.clients.matchAll = vi.fn(async () => windows);
    if (marker) worker.entries.set('https://pdkef.test/__pdkef/precache-complete/', new Response('ok'));
    if (waiting) worker.self.registration.waiting = {};
    return worker;
  };
  const runCheck = async (worker) => {
    await dispatchMessage(worker, CHECK);
  };

  it('tells every page window, then skips waiting once each said ready', async () => {
    const a = criticalWindow('a');
    const b = criticalWindow('b', 'late');
    const sitemap = criticalWindow('s', 'ready', 'https://pdkef.test/sitemap.xml');
    const worker = build({ windows: [a, b, sitemap] });
    const done = runCheck(worker);
    await settle();
    expect(a.postMessage).toHaveBeenCalledWith(UPDATE, [expect.anything()]);
    expect(b.postMessage).toHaveBeenCalledWith(UPDATE, [expect.anything()]);
    expect(sitemap.postMessage).not.toHaveBeenCalled();
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
    b.reply();
    await done;
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('skips waiting when no page is open', async () => {
    const worker = build();
    await runCheck(worker);
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('skips waiting at the cap when a tab never answers, and not before', async () => {
    vi.useFakeTimers();
    try {
      const worker = build({ windows: [criticalWindow('a'), criticalWindow('frozen', 'never')] });
      const done = runCheck(worker);
      await settle();
      await vi.advanceTimersByTimeAsync(74_999);
      expect(worker.self.skipWaiting).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await done;
      expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is single-flight: a second check while one runs asks nobody again', async () => {
    const a = criticalWindow('a', 'late');
    const worker = build({ windows: [a] });
    const first = runCheck(worker);
    await settle();
    const second = runCheck(worker);
    await settle();
    expect(a.postMessage).toHaveBeenCalledTimes(1);
    a.reply();
    await Promise.all([first, second]);
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('does nothing when this worker is not the waiting one', async () => {
    const a = criticalWindow('a');
    const worker = build({ windows: [a], waiting: false });
    await runCheck(worker);
    expect(a.postMessage).not.toHaveBeenCalled();
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('does nothing when another worker is the waiting one', async () => {
    const a = criticalWindow('a');
    const worker = build({ windows: [a] });
    worker.self.serviceWorker = {};
    await runCheck(worker);
    expect(a.postMessage).not.toHaveBeenCalled();
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('does nothing offline, asks nobody and fetches nothing', async () => {
    const a = criticalWindow('a');
    const worker = build({ windows: [a], marker: false });
    worker.self.navigator.onLine = false;
    await runCheck(worker);
    expect(a.postMessage).not.toHaveBeenCalled();
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
    expect(worker.fetchImpl).not.toHaveBeenCalled();
  });

  it('does nothing while the build is not fully precached and a URL still fails', async () => {
    const a = criticalWindow('a');
    const worker = build({ windows: [a], marker: false });
    worker.fetchImpl.mockImplementation(async (request) => (requestUrl(request).endsWith('/precache-manifest.json')
      ? new Response(JSON.stringify({ urls: ['/', '/sign/'] }))
      : new Response('no', { status: 503 })));
    await runCheck(worker);
    expect(a.postMessage).not.toHaveBeenCalled();
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('finishes a missing precache online and then forces', async () => {
    const worker = build({ marker: false });
    worker.fetchImpl.mockImplementation(async (request) => (requestUrl(request).endsWith('/precache-manifest.json')
      ? new Response(JSON.stringify({ urls: ['/', '/sign/'] }))
      : new Response('asset')));
    await runCheck(worker);
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a build that is not critical over the one cached', async () => {
    const a = criticalWindow('a');
    const equal = build({ windows: [a], keys: [`pdkef-c${SHIPPED_CRITICAL + 1}-previous`] });
    await runCheck(equal);
    const same = build({ windows: [a], source: plainSource, version: SHIPPED_CRITICAL });
    await runCheck(same);
    expect(a.postMessage).not.toHaveBeenCalled();
    expect(equal.self.skipWaiting).not.toHaveBeenCalled();
    expect(same.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('does not skip waiting when it stopped being the waiting worker, or went offline, during the wait', async () => {
    const replaced = criticalWindow('a', 'late');
    const first = build({ windows: [replaced] });
    const replacedDone = runCheck(first);
    await settle();
    first.self.registration.waiting = null;
    replaced.reply();
    await replacedDone;
    expect(first.self.skipWaiting).not.toHaveBeenCalled();

    const dropped = criticalWindow('b', 'late');
    const second = build({ windows: [dropped] });
    const droppedDone = runCheck(second);
    await settle();
    second.self.navigator.onLine = false;
    dropped.reply();
    await droppedDone;
    expect(second.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('runs at the end of install without holding the install open', async () => {
    vi.useFakeTimers();
    try {
      const frozen = criticalWindow('frozen', 'never');
      const worker = build({ windows: [frozen], marker: false });
      worker.fetchImpl.mockImplementation(manifestResponder(['/', '/sign/']));
      await dispatchInstall(worker);
      await settle();
      expect(frozen.postMessage).toHaveBeenCalledWith(UPDATE, [expect.anything()]);
      expect(worker.self.skipWaiting).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(75_000);
      expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for the install to settle into waiting before it forces', async () => {
    const a = criticalWindow('a');
    const worker = build({ windows: [a], waiting: false, marker: false });
    worker.fetchImpl.mockImplementation(manifestResponder(['/', '/sign/']));
    let statechange;
    worker.self.serviceWorker = { state: 'installing', addEventListener: (_name, listener) => { statechange = listener; } };
    await dispatchInstall(worker);
    await settle();
    expect(a.postMessage).not.toHaveBeenCalled();
    worker.self.serviceWorker.state = 'installed';
    worker.self.registration.waiting = worker.self.serviceWorker;
    statechange();
    await settle();
    expect(a.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('never runs for a build at the shipped critical version, on install or on a check', async () => {
    const a = criticalWindow('a');
    const worker = build({ windows: [a], source: plainSource, version: SHIPPED_CRITICAL });
    worker.fetchImpl.mockImplementation(manifestResponder(['/', '/sign/']));
    await dispatchInstall(worker);
    await runCheck(worker);
    expect(a.postMessage).not.toHaveBeenCalled();
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });
});
