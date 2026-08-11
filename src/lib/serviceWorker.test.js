import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const workerSource = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');

function requestUrl(request) {
  return typeof request === 'string' ? new URL(request, 'https://pdkef.test').href : request.url;
}

function createWorker(fetchImpl = vi.fn()) {
  const listeners = new Map();
  const entries = new Map();
  const cache = {
    match: vi.fn(async (request) => entries.get(requestUrl(request))),
    put: vi.fn(async (request, response) => entries.set(requestUrl(request), response)),
  };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => ['pdkef-previous']),
    delete: vi.fn(async () => true),
  };
  const self = {
    location: { origin: 'https://pdkef.test' },
    addEventListener: (name, listener) => listeners.set(name, listener),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
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
  it('atomically precaches the manifest before activating', async () => {
    const fetchImpl = vi.fn(async (request) => {
      const url = requestUrl(request);
      if (url.endsWith('/precache-manifest.json')) {
        return new Response(JSON.stringify({ urls: ['/', '/sign/', '/_astro/app.js'] }));
      }
      return new Response(`asset:${url}`);
    });
    const worker = createWorker(fetchImpl);
    const waits = [];

    worker.listeners.get('install')({ waitUntil: (promise) => waits.push(Promise.resolve(promise)) });
    await Promise.all(waits);

    expect(worker.self.skipWaiting).toHaveBeenCalledOnce();
    expect(Array.from(worker.entries.keys())).toEqual([
      'https://pdkef.test/',
      'https://pdkef.test/sign/',
      'https://pdkef.test/_astro/app.js',
    ]);
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
