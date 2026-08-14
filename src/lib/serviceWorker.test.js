import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const workerSource = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');

function requestUrl(request) {
  return typeof request === 'string' ? new URL(request, 'https://pdkef.test').href : request.url;
}

function createWorker(fetchImpl = vi.fn(), cacheKeys = ['pdkef-previous']) {
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
    Request,
    Response,
    URL,
    Promise,
    Error,
    Array,
    console,
  });

  return { cache, caches, entries, fetchImpl, listeners, self };
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
