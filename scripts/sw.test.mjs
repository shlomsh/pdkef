import './undiciGlobals.test-helper.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { http, HttpResponse } from 'msw';
import undici from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drainPromises } from '../src/test/support/drainPromises.ts';
import { answerNetwork, server } from '../src/test/support/network.ts';
import { minifyServiceWorker } from './minifyServiceWorker.mjs';
import { pageHash } from './pageHash.mjs';
import { installPaths as budgetedInstallPaths } from './check-precache-budget.mjs';

const workerSource = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');
// The CRITICAL_VERSION this repo ships (MEM-13). Tests derive "plain" and "critical" builds from
// it, so bumping it for a real fix needs no test edit.
const SHIPPED_CRITICAL = Number(/const CRITICAL_VERSION = (\d+);/.exec(workerSource)[1]);
const minifiedWorkerSource = minifyServiceWorker(workerSource);

// One real Cache Storage per origin, as in a browser: undici's, emptied for each test.
const cacheStorage = undici.caches;
// Forced failures of one cache write or read are spied on here: every `caches.open` hands out a new Cache object.
const CachePrototype = Object.getPrototypeOf(await cacheStorage.open('prototype'));
const absolute = (url) => new URL(url, 'https://pdkef.test').href;

const realSetTimeout = setTimeout;
const realClearTimeout = clearTimeout;
const GIVE_UP_MS = 3000;
answerNetwork();
async function clearCaches() {
  for (const key of await cacheStorage.keys()) await cacheStorage.delete(key);
}
beforeEach(clearCaches);
// A worker is stopped when its test ends, as a browser stops one: it asks for nothing more, and what it asked
// for is answered first, so the next test's handlers never see it.
const running = new Set();
afterEach(async () => {
  const workers = [...running];
  running.clear();
  for (const worker of workers) worker.stopped = true;
  await Promise.allSettled(workers.flatMap((worker) => [...worker.inflight]));
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Forced: Node has no window client.
function homeWindow() {
  return { id: 'home', url: 'https://pdkef.test/', postMessage: (_message, [port]) => port.postMessage({ busy: false }) };
}

// A request the site has no answer for: the device is offline.
const offline = () => HttpResponse.error();

/**
 * Runs the worker on real Cache Storage (undici), real IndexedDB (fake-indexeddb) and real fetch, answered by MSW.
 * `site` is what the server answers: a Request (and the cache mode the worker set on it) in, a Response out.
 * `worker.requests` lists what the worker asked for.
 */
function createWorker(site = offline, cacheKeys = ['pdkef-previous'], source = workerSource, criticalVersion = SHIPPED_CRITICAL, extraContext = {}) {
  const listeners = new Map();
  const currentCacheKey = `pdkef-c${criticalVersion}-__BUILD_ID__`;
  // `open` adds the cache before it first yields, so each one is there when the worker starts.
  for (const key of [...cacheKeys, currentCacheKey]) void cacheStorage.open(key);
  vi.spyOn(cacheStorage, 'delete');
  // `order` is what the worker asked of its registration, in order; `skipped` settles when it first skips waiting.
  let skipped;
  const worker = { listeners, order: [], requests: [], site, stopped: false, inflight: new Set(), skipped: new Promise((resolve) => { skipped = resolve; }), windows: [homeWindow()] };
  // MSW's copy of a request loses its cache mode, so the handler is also told the one the worker set.
  server.use(http.all('https://pdkef.test/*', ({ request }) => worker.site(request, worker.requests.findLast((asked) => asked.url === request.url)?.cache ?? request.cache)));
  const self = {
    location: { origin: 'https://pdkef.test' },
    addEventListener: (name, listener) => listeners.set(name, listener),
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: Node has no service worker scope, so its answers below are mocks.
    skipWaiting: vi.fn(async () => { worker.order.push('skipWaiting'); skipped(); }),
    // MEM-35: the install set starts from the pages open in a tab, so a worker is born with the
    // home page open (idle) unless a test sets its own windows.
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: Node has no clients either; a test sets the open tabs in `worker.windows`.
    clients: { claim: vi.fn(async () => { worker.order.push('claim'); }), matchAll: vi.fn(async () => worker.windows) },
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: nor a registration.
    registration: { unregister: vi.fn(async () => true) },
    navigator: { onLine: true },
  };
  running.add(worker);
  const indexedDB = new IDBFactory();

  const context = {
    self,
    caches: cacheStorage,
    // Real fetch; what the worker asked for is noted first, with the cache mode it set (MSW's copy loses it).
    fetch: (input, init) => {
      if (worker.stopped) return Promise.reject(new TypeError('Failed to fetch'));
      worker.requests.push(input instanceof Request ? input : new Request(input, init));
      const asking = fetch(input, init);
      const done = () => worker.inflight.delete(asking);
      worker.inflight.add(asking);
      asking.then(done, done);
      return asking;
    },
    indexedDB,
    Request,
    Response,
    URL,
    crypto: globalThis.crypto,
    AbortController,
    TransformStream,
    ReadableStream,
    Promise,
    Error,
    Array,
    console,
    MessageChannel,
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    // Forced: a mock resource observer that sees nothing, so a worker counts no downloads unless a test says so; Node's real one
    // also sees every other worker's, since they share the process.
    PerformanceObserver: class { static supportedEntryTypes = ['resource']; observe() {} },
    ...extraContext,
  };
  vm.runInNewContext(source, context);

  const open = (key = currentCacheKey) => cacheStorage.open(key);
  return Object.assign(worker, {
    caches: cacheStorage,
    context,
    indexedDB,
    self,
    /** What a cache holds for a URL (this build's cache unless named). */
    stored: async (url, key) => (await open(key)).match(absolute(url)),
    holds: async (url, key) => !!await (await open(key)).match(absolute(url)),
    store: async (url, response, key) => (await open(key)).put(absolute(url), response),
    drop: async (url, key) => (await open(key)).delete(absolute(url)),
    storedUrls: async (key) => (await (await open(key)).keys()).map((request) => request.url),
    fetchedPaths: () => worker.requests.map((request) => new URL(request.url).pathname),
  });
}

// A wait for something the worker does. A worker that never does it lets the test go on after 3 s, to fail on the
// assertion that follows.
async function orGiveUp(promise) {
  let timer;
  const late = new Promise((resolve) => { timer = realSetTimeout(resolve, GIVE_UP_MS); });
  await Promise.race([promise, late]);
  realClearTimeout(timer);
}

// Background work has no event to await, so a test waits for what it leaves in storage.
async function untilHeld(worker, ...urls) {
  let givenUp = false;
  const held = async () => {
    while (!givenUp && !(await Promise.all(urls.map((url) => worker.holds(url)))).every(Boolean)) {
      await new Promise((resolve) => { realSetTimeout(resolve, 5); });
    }
  };
  await orGiveUp(held());
  givenUp = true;
}

// What a cache holds, keyed by URL (this build's cache unless named).
async function everything(key) {
  const cache = await cacheStorage.open(key ?? `pdkef-c${SHIPPED_CRITICAL}-__BUILD_ID__`);
  return new Map(await Promise.all((await cache.keys()).map(async (request) => [request.url, await cache.match(request)])));
}

// Every handoff record the worker wrote into the drafts database, read back through the same IndexedDB.
function handoffs(worker) {
  return new Promise((resolve, reject) => {
    const open = worker.indexedDB.open('pdf-toolkit-workspace', 1);
    open.onerror = () => reject(open.error);
    open.onupgradeneeded = () => open.result.createObjectStore('workspace', { keyPath: 'tool' });
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('workspace').objectStore('workspace').getAll();
      read.onsuccess = () => { db.close(); resolve(read.result); };
      read.onerror = () => reject(read.error);
    };
  });
}

/** A page load, which a Request made by script cannot be. */
function navigation(url, init) {
  const request = new Request(absolute(url), init);
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  return request;
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

// A v2 manifest of this build: `urls` is the shell, `pages` the per-page lists, `hashes` the
// hashes of every unhashed-URL file (MEM-22). `build` stays the placeholder id the worker carries in tests.
// `extra` adds fields such as `headers`, the fingerprint of vercel.json's response headers (MEM-32).
function manifestResponder(urls, perUrl = () => new Response('asset'), pages = {}, hashes = {}, extra = {}) {
  return (async (request) => {
    const url = request.url;
    // MEM-35: the worker installs page closures, not the shell, so `urls` is the closure of the home page.
    if (url.endsWith('/precache-manifest.json')) return new Response(JSON.stringify({ version: 2, build: '__BUILD_ID__', shell: urls, pages: { '/': urls, ...pages }, hashes, ...extra }));
    return perUrl(new URL(url).pathname);
  });
}

// `ids` carries the event's clientId (a subresource's page) or resultingClientId (a navigation's new page).
async function dispatchFetch(worker, request, ids = {}) {
  /** @type {Promise<Response>} */
  let responsePromise;
  const background = [];
  worker.listeners.get('fetch')({
    ...ids,
    request,
    respondWith: (promise) => { responsePromise = Promise.resolve(promise); },
    waitUntil: (promise) => background.push(Promise.resolve(promise)),
  });
  return { response: await responsePromise, background };
}

describe('offline-first service worker', () => {
  it('never answers an /api/ request, so the cache-first branch cannot keep the first reply', async () => {
    const worker = createWorker(manifestResponder(['/']));
    await dispatchInstall(worker);
    await worker.store('https://pdkef.test/api/notes', new Response('{"notes":[]}'));
    const { response } = await dispatchFetch(worker, new Request('https://pdkef.test/api/notes'));
    expect(response).toBeUndefined();
  });

  it('precaches the manifest without claiming pages from the previous build', async () => {
    const worker = createWorker(manifestResponder(['/', '/sign/', '/_astro/app.js']));

    await dispatchInstall(worker);

    expect((await worker.storedUrls()).sort()).toEqual([
      'https://pdkef.test/',
      'https://pdkef.test/__pdkef/manifest/',
      'https://pdkef.test/__pdkef/precache-complete/',
      'https://pdkef.test/_astro/app.js',
      'https://pdkef.test/sign/',
    ]);
    // skipWaiting would activate over pages still running the old build, whose
    // cache activate then deletes while they are lazy-importing from it.
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  describe('MEM-16: unchanged hashed files carry over from the previous cache', () => {
    it('plans only the differing hashed URLs, and every unhashed URL, for fetch', () => {
      const { planPrecache } = createWorker().context;
      const previous = ['/', '/sign/', '/_astro/a.js', '/_astro/b.js', '/_astro/c.js', '/fonts/x.ttf'];
      const next = ['/', '/sign/', '/_astro/a.js', '/_astro/b.js', '/_astro/d.js', '/fonts/x.ttf'];
      const plan = planPrecache(next, new Set(previous));
      expect(Array.from(plan.copy)).toEqual(['/_astro/a.js', '/_astro/b.js']);
      expect(Array.from(plan.fetch)).toEqual(['/', '/sign/', '/_astro/d.js', '/fonts/x.ttf']);
    });

    it('plans a held unhashed URL with a manifest hash for verification, not fetch (MEM-32)', () => {
      const { planPrecache } = createWorker().context;
      const plan = planPrecache(['/', '/sign/', '/new/', '/_astro/a.js'], new Set(['/', '/sign/', '/_astro/a.js']), { '/': 'h1', '/new/': 'h2' });
      expect(Array.from(plan.copy)).toEqual(['/_astro/a.js']);
      expect(Array.from(plan.verify)).toEqual(['/']);
      expect(Array.from(plan.fetch)).toEqual(['/sign/', '/new/']);
    });

    it('copies a hashed file from an old own cache without a network request', async () => {
      const worker = createWorker(manifestResponder(['/', '/_astro/a.js', '/_astro/b.js']), ['pdkef-old']);
      await worker.store('https://pdkef.test/_astro/a.js', new Response('old-a'), 'pdkef-old');

      await dispatchInstall(worker);

      const fetched = worker.fetchedPaths();
      expect(fetched).not.toContain('/_astro/a.js');
      expect(fetched).toEqual(expect.arrayContaining(['/', '/_astro/b.js']));
      expect(await (await worker.stored('https://pdkef.test/_astro/a.js')).text()).toBe('old-a');
      expect(await worker.holds('https://pdkef.test/_astro/b.js')).toBe(true);
      expect(await worker.holds('https://pdkef.test/')).toBe(true);
    });

    // MEM-32: each deploy refetched every page and /shared/ chunk from every installed visitor,
    // which is what spent the CDN request quota. Unchanged bytes now carry over too, but only from
    // a build served with the same vercel.json response headers, since a copy keeps its old headers.
    describe('MEM-32: unchanged unhashed files carry over when their bytes and headers still match', () => {
      const MANIFEST_KEY = 'https://pdkef.test/__pdkef/manifest/';
      const hashes = { '/': pageHash('home'), '/shared/a.js': pageHash('same a'), '/sign/': pageHash('new sign') };
      const install = async ({ current = 'h1', previous = 'h1' } = {}) => {
        const network = { '/': 'home', '/shared/a.js': 'same a', '/sign/': 'new sign' };
        const worker = createWorker(manifestResponder(['/', '/shared/a.js', '/sign/'], (pathname) => new Response(network[pathname]), {}, hashes, current ? { headers: current } : {}), ['pdkef-old', 'pdkef-older']);
        for (const key of ['pdkef-old', 'pdkef-older']) await worker.store(MANIFEST_KEY, new Response(JSON.stringify(previous ? { headers: previous } : {})), key);
        await worker.store('https://pdkef.test/', new Response('stale home'), 'pdkef-old');
        await worker.store('https://pdkef.test/', new Response('home', { headers: { 'X-Keep': 'yes' } }), 'pdkef-older');
        await worker.store('https://pdkef.test/shared/a.js', new Response('same a'), 'pdkef-old');
        await worker.store('https://pdkef.test/sign/', new Response('old sign'), 'pdkef-old');
        await dispatchInstall(worker);
        const fetched = worker.fetchedPaths();
        return { worker, fetched };
      };

      it('copies a file whose old bytes match this build\'s hash, from any previous cache, and fetches one that changed', async () => {
        const { worker, fetched } = await install();
        expect(fetched).not.toContain('/');
        expect(fetched).not.toContain('/shared/a.js');
        expect(fetched).toContain('/sign/');
        const home = await worker.stored('https://pdkef.test/');
        expect(home.headers.get('X-Keep')).toBe('yes');
        expect(await home.text()).toBe('home');
        expect(await (await worker.stored('https://pdkef.test/shared/a.js')).text()).toBe('same a');
        expect(await (await worker.stored('https://pdkef.test/sign/')).text()).toBe('new sign');
      });

      it.each([
        ['the response headers changed', { previous: 'h0' }],
        ['the previous build recorded no headers', { previous: null }],
        ['this build records no headers', { current: null }],
        ['neither build records headers', { current: null, previous: null }],
      ])('fetches every unhashed file when %s', async (_name, options) => {
        const { fetched } = await install(options);
        expect(fetched).toEqual(expect.arrayContaining(['/', '/shared/a.js', '/sign/']));
      });

      it('fetches a held file the manifest lists no hash for', async () => {
        const worker = createWorker(manifestResponder(['/', '/shared/a.js'], () => new Response('fresh'), {}, {}, { headers: 'h1' }), ['pdkef-old']);
        await worker.store(MANIFEST_KEY, new Response(JSON.stringify({ headers: 'h1' })), 'pdkef-old');
        await worker.store('https://pdkef.test/shared/a.js', new Response('fresh'), 'pdkef-old');
        await dispatchInstall(worker);
        const fetched = worker.fetchedPaths();
        expect(fetched).toEqual(expect.arrayContaining(['/', '/shared/a.js']));
      });
    });

    it('fetches a hashed file through the HTTP cache and everything else with cache no-cache', async () => {
      const worker = createWorker(manifestResponder(['/', '/_astro/b.js', '/fonts/x.ttf']));

      await dispatchInstall(worker);

      const modes = new Map(worker.requests.map((request) => [new URL(request.url).pathname, request.cache]));
      expect(modes.get('/_astro/b.js')).toBe('default');
      expect(modes.get('/')).toBe('no-cache');
      expect(modes.get('/fonts/x.ttf')).toBe('no-cache');
    });
  });

  it('keeps installing when individual assets fail, so one bad response is not fatal', async () => {
    const worker = createWorker(manifestResponder(
      ['/', '/sign/', '/fonts/heebo.ttf'],
      (pathname) => (pathname === '/fonts/heebo.ttf' ? new Response('nope', { status: 503 }) : new Response('asset')),
    ));

    await dispatchInstall(worker);

    expect((await worker.storedUrls()).sort()).toEqual([
      'https://pdkef.test/',
      'https://pdkef.test/__pdkef/manifest/',
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

  describe('MEM-23: precache request time limit', () => {
    const LIMIT = Number(/const PRECACHE_STALL_MS = (\d+);/.exec(workerSource)?.[1] ?? 30000);
    const pathOf = (request) => new URL(request.url).pathname;
    // The worker's timers run on a fake clock; the network, storage and message ports stay real.
    const fakeClock = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    it('aborts a request that never settles, reports its URL missed, and still caches the rest', async () => {
      fakeClock();
      try {
        let stalled;
        const aborted = new Promise((resolveAborted) => { stalled = resolveAborted; });
        const abortedPaths = [];
        const base = manifestResponder(['/', '/sign/', '/_astro/app.js']);
        const worker = createWorker((request) => {
          if (pathOf(request) !== '/sign/') return base(request);
          request.signal.addEventListener('abort', () => { abortedPaths.push('/sign/'); stalled(); });
          return new Promise(() => {});
        });
        const install = dispatchInstall(worker);
        await untilHeld(worker, '/', '/_astro/app.js');
        await vi.advanceTimersByTimeAsync(LIMIT - 1);
        expect(abortedPaths).toEqual([]);
        await vi.advanceTimersByTimeAsync(1);
        // The worker's own request is aborted at once; the server side hears of it afterwards.
        expect(worker.requests.find((asked) => pathOf(asked) === '/sign/').signal.aborted).toBe(true);
        await install;
        await orGiveUp(aborted);
        expect(abortedPaths).toEqual(['/sign/']);
        expect(await worker.holds('https://pdkef.test/')).toBe(true);
        expect(await worker.holds('https://pdkef.test/_astro/app.js')).toBe(true);
        expect(await worker.holds('https://pdkef.test/sign/')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('counts a URL as missed when its body never arrives', async () => {
      fakeClock();
      try {
        const base = manifestResponder(['/', '/sign/', '/_astro/app.js']);
        // Headers arrive, the body never does.
        const worker = createWorker((request) => (pathOf(request) === '/sign/' ? new Response(new ReadableStream()) : base(request)));
        const install = dispatchInstall(worker);
        await untilHeld(worker, '/', '/_astro/app.js');
        await vi.advanceTimersByTimeAsync(LIMIT);
        expect(worker.requests.find((asked) => pathOf(asked) === '/sign/').signal.aborted).toBe(true);
        await install;
        expect(await worker.holds('https://pdkef.test/_astro/app.js')).toBe(true);
        expect(await worker.holds('https://pdkef.test/sign/')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('counts a URL as missed when its body never finishes storing', async () => {
      fakeClock();
      try {
        const real = CachePrototype.put;
        // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a stalled body ends when its request is aborted; only a write deaf to that shows the time limit itself.
        vi.spyOn(CachePrototype, 'put').mockImplementation(function put(request, response) {
          return (typeof request === 'string' ? request : request.url).endsWith('/sign/') ? new Promise(() => {}) : real.call(this, request, response);
        });
        const worker = createWorker(manifestResponder(['/', '/sign/', '/_astro/app.js']));
        const install = dispatchInstall(worker);
        await untilHeld(worker, '/', '/_astro/app.js');
        await vi.advanceTimersByTimeAsync(LIMIT);
        await install;
        expect(await worker.holds('https://pdkef.test/_astro/app.js')).toBe(true);
        expect(await worker.holds('https://pdkef.test/sign/')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not abort a body that keeps arriving, however long it takes in total', async () => {
      fakeClock();
      try {
        const base = manifestResponder(['/', '/sign/', '/_astro/app.js']);
        // A chunk every 10 s, asked for only once the reader wants the next one.
        let armed;
        const nextArmed = () => new Promise((resolveArmed) => { armed = resolveArmed; });
        let sent = 0;
        const slowBody = () => new ReadableStream({
          pull: (controller) => new Promise((resolvePull) => {
            if (sent === 6) {
              controller.close();
              resolvePull();
              return;
            }
            setTimeout(() => {
              controller.enqueue(new Uint8Array(4));
              sent += 1;
              resolvePull();
            }, 10000);
            armed();
          }),
        }, { highWaterMark: 0 });
        const worker = createWorker((request) => (pathOf(request) === '/sign/' ? new Response(slowBody()) : base(request)));
        let ready = nextArmed();
        const install = dispatchInstall(worker);
        for (let chunk = 0; chunk < 6; chunk += 1) {
          await ready;
          ready = nextArmed();
          await vi.advanceTimersByTimeAsync(10000);
        }
        await install;
        expect(await worker.holds('https://pdkef.test/sign/')).toBe(true);
        expect(await worker.holds('https://pdkef.test/__pdkef/precache-complete/')).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('clears the timer of a request that resolves in time', async () => {
      fakeClock();
      try {
        const worker = createWorker(manifestResponder(['/', '/sign/', '/_astro/app.js']));
        await dispatchInstall(worker);
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('uninstalls itself and drops its caches when the origin serves no build', async () => {
    const worker = createWorker(
      () => new Response('not found', { status: 404 }),
      ['pdkef-previous', 'some-other-app'],
    );

    await dispatchInstall(worker);

    expect(worker.self.registration.unregister).toHaveBeenCalledOnce();
    expect(worker.caches.delete).toHaveBeenCalledWith('pdkef-previous');
    expect(worker.caches.delete).not.toHaveBeenCalledWith('some-other-app');
    expect(await worker.caches.keys()).not.toContain('pdkef-previous');
    expect(await worker.caches.keys()).toContain('some-other-app');
  });

  it('only ever deletes its own caches on activate', async () => {
    const worker = createWorker(undefined, ['pdkef-previous', 'some-other-app']);

    await dispatchActivate(worker);

    expect(worker.caches.delete).toHaveBeenCalledWith('pdkef-previous');
    expect(worker.caches.delete).not.toHaveBeenCalledWith('some-other-app');
    expect(await worker.caches.keys()).not.toContain('pdkef-previous');
    expect(await worker.caches.keys()).toContain('some-other-app');
    expect(worker.self.clients.claim).toHaveBeenCalledOnce();
  });

  it('provisions every face in a requested family before reporting it ready offline', async () => {
    const worker = createWorker((async (request) => new Response(`bytes:${new URL(request.url).pathname}`)));
    const pack = {
      family: 'Scheherazade New',
      urls: ['/fonts/ScheherazadeNew-Regular.ttf', '/fonts/ScheherazadeNew-Bold.ttf'],
    };

    expect(await dispatchMessage(worker, { type: 'pdkef:font-pack-status', packs: [pack] }))
      .toEqual({ ok: true, ready: { 'Scheherazade New': false } });

    expect(await dispatchMessage(worker, { type: 'pdkef:font-pack-provision', packs: [pack] }))
      .toEqual({ ok: true, ready: { 'Scheherazade New': true } });
    expect((await worker.storedUrls())).toEqual(expect.arrayContaining([
      'https://pdkef.test/fonts/ScheherazadeNew-Regular.ttf',
      'https://pdkef.test/fonts/ScheherazadeNew-Bold.ttf',
      'https://pdkef.test/__pdkef/offline-font-pack/Scheherazade%20New',
    ]));
  });

  it('reports a family ready only with its marker and every face cached', async () => {
    const worker = createWorker();
    const pack = { family: 'Noto Sans Bengali', urls: ['/fonts/NotoSansBengali-Regular.ttf', '/fonts/NotoSansBengali-Bold.ttf'] };
    const marker = 'https://pdkef.test/__pdkef/offline-font-pack/Noto%20Sans%20Bengali';
    const status = async () => (await dispatchMessage(worker, { type: 'pdkef:font-pack-status', packs: [pack] })).ready['Noto Sans Bengali'];
    for (const url of pack.urls) await worker.store(url, new Response('face'));
    expect(await status()).toBe(false);
    await worker.store(marker, new Response(JSON.stringify(pack)));
    expect(await status()).toBe(true);
    await worker.drop(pack.urls[1]);
    expect(await status()).toBe(false);
  });

  it('does not claim a partial family is ready when one face cannot be downloaded', async () => {
    const worker = createWorker((async (request) => (
      request.url.endsWith('Bold.ttf') ? new Response('missing', { status: 503 }) : new Response('regular')
    )));
    const pack = {
      family: 'Noto Sans Bengali',
      urls: ['/fonts/NotoSansBengali-Regular.ttf', '/fonts/NotoSansBengali-Bold.ttf'],
    };

    const result = await dispatchMessage(worker, { type: 'pdkef:font-pack-provision', packs: [pack] });

    expect(result.ok).toBe(false);
    expect(await worker.holds('https://pdkef.test/__pdkef/offline-font-pack/Noto%20Sans%20Bengali')).toBe(false);
  });

  describe('MEM-35: the install caches the tools a person uses, not the whole app', () => {
    const MERGE = ['/merge/', '/_astro/Merge.B1.js', '/pdfjs-dist-wasm/openjpeg.wasm'];
    const SIGN = ['/sign/', '/_astro/shared.A1.js', '/_astro/Sign.C1.js'];
    const REDACT = ['/redact/', '/_astro/shared.A1.js', '/_astro/Redact.D1.js'];
    const PAGES = { '/': ['/'], '/merge/': MERGE, '/sign/': SIGN, '/redact/': REDACT };
    const abs = (paths) => paths.map((path) => `https://pdkef.test${path}`);
    const withoutInternal = async (worker) => (await worker.storedUrls()).filter((key) => !key.includes('/__pdkef/')).sort();
    const open = (worker, ...paths) => {
      worker.windows = paths.map((path) => ({ id: path, url: `https://pdkef.test${path}?x=1` }));
    };
    const fetchedPaths = (worker) => worker.fetchedPaths();

    describe('installPaths', () => {
      const manifest = { pages: PAGES };
      const paths = (...args) => createWorker().context.installPaths(manifest, ...args);

      it('is / alone when nothing is open or held', () => {
        expect(Array.from(paths([], []))).toEqual(['/']);
      });

      it('adds the closure of every open or held page, each URL once, / first, in manifest order', () => {
        expect(Array.from(paths(['/redact/'], ['/sign/']))).toEqual([
          '/', '/sign/', '/_astro/shared.A1.js', '/_astro/Sign.C1.js', '/redact/', '/_astro/Redact.D1.js',
        ]);
      });

      // MEM-40 replaces "always includes the whole closure of /, the offline fallback": the home page's
      // files are installed only when / itself is open or held.
      it('keeps the / document for the build check, and a tool install holds no file only the home page uses', () => {
        const home = ['/', '/_astro/home.css'];
        const pages = { ...PAGES, '/': home };
        expect(Array.from(createWorker().context.installPaths({ pages }, [], []))).toEqual(['/']);
        const tool = Array.from(createWorker().context.installPaths({ pages }, ['/sign/'], []));
        expect(tool).toEqual(['/', '/sign/', '/_astro/shared.A1.js', '/_astro/Sign.C1.js']);
        expect(tool).not.toContain('/_astro/home.css');
      });

      it('includes the whole closure of / when / is open or held', () => {
        const home = ['/', '/_astro/home.css'];
        const pages = { ...PAGES, '/': home };
        expect(Array.from(createWorker().context.installPaths({ pages }, ['/'], []))).toEqual(home);
        expect(Array.from(createWorker().context.installPaths({ pages }, [], ['/', '/sign/']))).toEqual([...home, '/sign/', '/_astro/shared.A1.js', '/_astro/Sign.C1.js']);
      });

      it('counts a page that is both open and held once', () => {
        expect(Array.from(paths(['/sign/'], new Set(['/sign/', '/_astro/Sign.C1.js'])))).toEqual(['/', '/sign/', '/_astro/shared.A1.js', '/_astro/Sign.C1.js']);
      });

      it('is what the budget guard measures for one open page', () => {
        for (const page of Object.keys(PAGES)) {
          expect(Array.from(paths([page], []))).toEqual(budgetedInstallPaths(PAGES, page));
        }
      });

      it('ignores a path that is no page of this build', () => {
        expect(Array.from(paths(['/sitemap.xml', '/gone/'], ['/_astro/Sign.C1.js', '/__pdkef/manifest/']))).toEqual(['/']);
      });
    });

    describe('missingHeldPages', () => {
      const missing = (...args) => Array.from(createWorker().context.missingHeldPages(...args));

      it('names the pages of this build a previous cache holds and the current one does not', () => {
        expect(missing(PAGES, new Set(['/sign/', '/merge/', '/gone/', '/_astro/Sign.C1.js']), new Set(['/sign/']))).toEqual(['/merge/']);
      });

      it('is empty when the current cache holds every such page, or no previous cache holds any', () => {
        expect(missing(PAGES, new Set(['/sign/']), new Set(['/sign/', '/'])).length).toBe(0);
        expect(missing(PAGES, new Set(), new Set()).length).toBe(0);
      });
    });

    it('an update is not ready, and completes, when a tool was opened on the old build after it installed', async () => {
      const worker = createWorker(manifestResponder(['/'], undefined, PAGES), ['pdkef-old']);
      open(worker);
      // A real previous cache always lists the / document (every install stores it, MEM-40).
      for (const url of ['/', ...SIGN]) await worker.store(url, new Response('old'), 'pdkef-old');
      await dispatchInstall(worker);
      const marker = 'https://pdkef.test/__pdkef/precache-complete/';
      expect(await worker.holds(marker)).toBe(true);
      expect(await dispatchMessage(worker, { type: 'pdkef:update-status' })).toMatchObject({ ready: true });
      // The person opens /merge/ on the old build; only the old cache gets it.
      for (const url of MERGE) await worker.store(url, new Response('old merge'), 'pdkef-old');
      expect(await worker.holds('https://pdkef.test/merge/')).toBe(false);
      expect(await dispatchMessage(worker, { type: 'pdkef:update-status' })).toMatchObject({ ready: false });
      await untilHeld(worker, ...MERGE);
      expect(await withoutInternal(worker)).toEqual(abs([...new Set(['/', ...SIGN, ...MERGE])]).sort());
      expect(await dispatchMessage(worker, { type: 'pdkef:update-status' })).toMatchObject({ ready: true });
    });

    // MEM-40 rewrites "a first install with only /sign/ open caches every URL of the closure of /".
    it('a first install with only /sign/ open caches the / document and the closure of /sign/, no other file of /', async () => {
      const HOME = ['/', '/_astro/home.css', '/site/entry.js'];
      const worker = createWorker(manifestResponder(HOME, undefined, { '/sign/': SIGN }), []);
      open(worker, '/sign/');
      await dispatchInstall(worker);
      expect(await withoutInternal(worker)).toEqual(abs([...new Set(['/', ...SIGN])]).sort());
    });

    it('a fresh install with /redact/ open caches / and the closure of /redact/, and nothing of /merge/', async () => {
      const worker = createWorker(manifestResponder(['/'], undefined, PAGES), []);
      open(worker, '/redact/');
      await dispatchInstall(worker);
      expect(await withoutInternal(worker)).toEqual(abs([...new Set(['/', ...REDACT])]).sort());
      expect(fetchedPaths(worker).some((path) => MERGE.includes(path) && path !== '/precache-manifest.json')).toBe(false);
      expect(await worker.holds('https://pdkef.test/__pdkef/precache-complete/')).toBe(true);
    });

    it('an install with no window open caches / alone', async () => {
      const worker = createWorker(manifestResponder(['/'], undefined, PAGES), []);
      open(worker);
      await dispatchInstall(worker);
      expect(await withoutInternal(worker)).toEqual(abs(['/']));
      expect(await worker.holds('https://pdkef.test/__pdkef/precache-complete/')).toBe(true);
    });

    it('a failed / still fails the install when nothing else is installed', async () => {
      const worker = createWorker(manifestResponder(['/'], () => new Response('no', { status: 503 }), PAGES), []);
      open(worker);
      await expect(dispatchInstall(worker)).rejects.toThrow();
    });

    it('a previous cache that held /sign/ carries its closure into the next build, copying hashed files', async () => {
      const worker = createWorker(manifestResponder(['/'], undefined, PAGES), ['pdkef-old']);
      open(worker, '/redact/');
      await worker.store('/', new Response('old home'), 'pdkef-old');
      await worker.store('/sign/', new Response('old sign page'), 'pdkef-old');
      await worker.store('/_astro/Sign.C1.js', new Response('old c1'), 'pdkef-old');
      await worker.store('/_astro/shared.A1.js', new Response('old shared'), 'pdkef-old');
      await dispatchInstall(worker);
      expect(await withoutInternal(worker)).toEqual(abs([...new Set(['/', ...REDACT, ...SIGN])]).sort());
      expect(await (await worker.stored('https://pdkef.test/_astro/Sign.C1.js')).text()).toBe('old c1');
      const fetched = fetchedPaths(worker);
      expect(fetched).not.toContain('/_astro/Sign.C1.js');
      expect(fetched).not.toContain('/_astro/shared.A1.js');
      expect(fetched).toContain('/sign/');
      expect(fetched).toContain('/_astro/Redact.D1.js');
      expect(fetched.some((path) => MERGE.includes(path) && path !== '/precache-manifest.json')).toBe(false);
    });

    // MEM-40 (review): every install stores the `/` document for the build check, so a previous
    // cache always lists `/`. Counting that as "held" carried the home page's whole closure into
    // the next build for a person who never opened the home page.
    describe('MEM-40: a / document alone does not make the home page held', () => {
      const HOME = ['/', '/shared/home.js', '/_astro/home.css'];
      const OLD_PAGES = { '/': HOME, '/sign/': SIGN };
      const previousBuild = async (worker, urls, { manifest = { hashes: {}, pages: OLD_PAGES } } = {}) => {
        for (const url of urls) await worker.store(url, new Response('old'), 'pdkef-old');
        if (manifest) await worker.store('/__pdkef/manifest/', new Response(JSON.stringify(manifest)), 'pdkef-old');
      };
      const build = () => createWorker(manifestResponder(HOME, undefined, { '/sign/': SIGN }), ['pdkef-old']);

      it('(a) a previous cache with the / document and the whole /sign/ closure installs /sign/ and no home-only file', async () => {
        const worker = build();
        open(worker);
        await previousBuild(worker, ['/', ...SIGN]);
        await dispatchInstall(worker);
        expect(await withoutInternal(worker)).toEqual(abs([...new Set(['/', ...SIGN])]).sort());
        expect(fetchedPaths(worker)).not.toContain('/shared/home.js');
      });

      it('(b) a previous cache that holds / with its whole closure carries the home closure into the next build', async () => {
        const worker = build();
        open(worker);
        await previousBuild(worker, HOME);
        await dispatchInstall(worker);
        expect(await withoutInternal(worker)).toEqual(abs(HOME).sort());
      });

      it('a previous cache missing one file of the home closure, or with no readable manifest, does not hold /', async () => {
        const cases = [
          { urls: ['/', '/shared/home.js', ...SIGN], options: {} },
          { urls: ['/', ...HOME, ...SIGN], options: { manifest: null } },
          { urls: ['/', ...HOME, ...SIGN], options: { manifest: { hashes: {}, pages: { '/': 'nope' } } } },
        ];
        for (const { urls, options } of cases) {
          await clearCaches();
          const worker = build();
          open(worker);
          await previousBuild(worker, urls, options);
          await dispatchInstall(worker);
          expect(await withoutInternal(worker)).toEqual(abs([...new Set(['/', ...SIGN])]).sort());
        }
      });

      it('(c) an update is not made to wait for a / document nobody opened', async () => {
        const worker = build();
        open(worker);
        await previousBuild(worker, ['/', ...SIGN]);
        await dispatchInstall(worker);
        expect(await dispatchMessage(worker, { type: 'pdkef:update-status' })).toMatchObject({ ready: true });
      });

      it('heldPagePaths drops / unless its whole closure is held, and keeps every other page', () => {
        const { heldPagePaths, closureHeld } = createWorker().context;
        const docs = new Set(['/', '/sign/', '/_astro/Sign.C1.js']);
        expect(Array.from(heldPagePaths(docs, false))).toEqual(['/sign/', '/_astro/Sign.C1.js']);
        expect(Array.from(heldPagePaths(docs, true))).toEqual(['/', '/sign/', '/_astro/Sign.C1.js']);
        expect(closureHeld({ pages: OLD_PAGES }, '/', new Set(HOME))).toBe(true);
        expect(closureHeld({ pages: OLD_PAGES }, '/', new Set(['/']))).toBe(false);
        expect(closureHeld(null, '/', new Set(HOME))).toBe(false);
      });
    });

    describe('MEM-40: the pdkef:cache-home message', () => {
      const HOME = ['/', '/shared/home.js', '/_astro/home.css'];
      const installed = async () => {
        const worker = createWorker(manifestResponder(HOME, undefined, { '/sign/': SIGN }), []);
        open(worker, '/sign/');
        await dispatchInstall(worker);
        worker.requests.length = 0;
        return worker;
      };

      it('makes the worker cache every URL of the closure of /', async () => {
        const worker = await installed();
        expect(await withoutInternal(worker)).not.toContain('https://pdkef.test/shared/home.js');
        await dispatchMessage(worker, { type: 'pdkef:cache-home' });
        expect(await withoutInternal(worker)).toEqual(abs([...new Set([...HOME, ...SIGN])]).sort());
        expect(fetchedPaths(worker)).not.toContain('/');
      });

      it('does nothing for an unknown message type', async () => {
        const worker = await installed();
        await dispatchMessage(worker, { type: 'pdkef:cache-homes' });
        expect(fetchedPaths(worker)).toEqual([]);
        expect(await withoutInternal(worker)).toEqual(abs([...new Set(['/', ...SIGN])]).sort());
      });

      it('is ignored by the waiting worker, which is not the one answering pages', async () => {
        const worker = await installed();
        worker.self.registration.waiting = worker.self.serviceWorker = {};
        await dispatchMessage(worker, { type: 'pdkef:cache-home' });
        expect(fetchedPaths(worker)).toEqual([]);
      });

      it('stays silent when a file fails', async () => {
        const worker = await installed();
        worker.site = (async () => new Response('no', { status: 503 }));
        await expect(dispatchMessage(worker, { type: 'pdkef:cache-home' })).resolves.toBeUndefined();
      });

      it('a / cached whole this way is held by the next build', async () => {
        const first = await installed();
        await dispatchMessage(first, { type: 'pdkef:cache-home' });
        const next = createWorker(manifestResponder(HOME, undefined, { '/sign/': SIGN }), ['pdkef-old']);
        open(next);
        // The first build is the previous one now: its files move to the old cache.
        for (const [url, response] of await everything()) await next.store(url, response, 'pdkef-old');
        await cacheStorage.delete(`pdkef-c${SHIPPED_CRITICAL}-__BUILD_ID__`);
        await dispatchInstall(next);
        expect(await withoutInternal(next)).toEqual(abs([...new Set([...HOME, ...SIGN])]).sort());
      });
    });

    it('a cached page with a closure file missing is not served from cache even with the complete marker', async () => {
      const worker = createWorker((async () => new Response('network merge')), []);
      const store = (url, body) => worker.store(`https://pdkef.test${url}`, new Response(body));
      await store('/__pdkef/manifest/', JSON.stringify({ hashes: {}, pages: PAGES }));
      await store('/__pdkef/precache-complete/', 'ok');
      await store('/merge/', 'cached merge');
      await store('/_astro/Merge.B1.js', 'js');
      const { response } = await dispatchFetch(worker, navigation('https://pdkef.test/merge/'));
      expect(await response.text()).toBe('network merge');
    });

    describe('a tool opened later', () => {
      const THIS = { '/': 'home', '/merge/': 'merge page', '/_astro/Merge.B1.js': 'merge js', '/pdfjs-dist-wasm/openjpeg.wasm': 'wasm' };
      const hashes = Object.fromEntries(Object.entries(THIS).filter(([url]) => !url.startsWith('/_astro/')).map(([url, bytes]) => [url, pageHash(bytes)]));
      const nav = navigation('https://pdkef.test/merge/');
      const installedHome = async (perUrl) => {
        const worker = createWorker(manifestResponder(['/'], perUrl, PAGES, hashes), []);
        open(worker);
        await dispatchInstall(worker);
        return worker;
      };
      const served = (extra = {}) => (pathname) => (pathname in THIS && !(pathname in extra) ? new Response(THIS[pathname]) : new Response('missing', { status: 404 }));

      it('has the rest of its closure cached in the background when the network answers with this build\'s page', async () => {
        const worker = await installedHome(served());
        expect(await withoutInternal(worker)).toEqual(abs(['/']));
        const { response, background } = await dispatchFetch(worker, nav, { resultingClientId: 'tab-1' });
        expect(await response.text()).toBe('merge page');
        await Promise.all(background);
        expect(await withoutInternal(worker)).toEqual(abs([...new Set(['/', ...MERGE])]).sort());
        worker.site = offline;
        const again = await dispatchFetch(worker, nav);
        expect(await again.response.text()).toBe('merge page');
      });

      it('caches nothing more when the page is not this build\'s, and stays silent when a file fails', async () => {
        const worker = await installedHome(served());
        worker.site = (async () => new Response('merge page of another build'));
        const other = await dispatchFetch(worker, nav, { resultingClientId: 'tab-1' });
        await Promise.all(other.background);
        expect(await withoutInternal(worker)).toEqual(abs(['/']));

        worker.site = (async (request) => {
          const { pathname } = new URL(request.url);
          return pathname === '/merge/' || pathname === '/pdfjs-dist-wasm/openjpeg.wasm' ? new Response(THIS[pathname]) : new Response('no', { status: 503 });
        });
        const partial = await dispatchFetch(worker, nav, { resultingClientId: 'tab-2' });
        await expect(Promise.all(partial.background)).resolves.toBeDefined();
        expect(await worker.holds('https://pdkef.test/_astro/Merge.B1.js')).toBe(false);
      });
    });

    describe('MEM-35: a first install caches the pages open when it takes control', () => {
      // The install already ran: its manifest is stored, and a tab opened while it ran sits at /merge/ uncached.
      const activating = async (cacheKeys) => {
        const worker = createWorker(manifestResponder(['/'], undefined, PAGES), cacheKeys);
        await worker.store('https://pdkef.test/__pdkef/manifest/', new Response(JSON.stringify({ hashes: {}, pages: PAGES })));
        open(worker, '/merge/');
        worker.requests.length = 0;
        return worker;
      };

      it('claims first, then caches the closure of every open page in the background', async () => {
        const worker = await activating([]);
        const base = manifestResponder(['/'], undefined, PAGES);
        let release;
        const held = new Promise((resolveHeld) => { release = resolveHeld; });
        let holdOne = true;
        worker.site = (async (request) => {
          worker.order.push('fetch');
          if (holdOne) { holdOne = false; await held; }
          return base(request);
        });
        // Activation resolves while a closure fetch is still pending: it does not wait for the caching.
        let settled = false;
        const activation = dispatchActivate(worker).then(() => { settled = true; });
        await activation;
        expect(settled).toBe(true);
        expect(worker.order[0]).toBe('claim');
        expect((await withoutInternal(worker)).length).toBeLessThan(MERGE.length);
        release();
        await untilHeld(worker, ...MERGE);
        expect(await withoutInternal(worker)).toEqual(abs(MERGE).sort());
      });

      it('fetches nothing for an open page on an update, where a previous cache exists', async () => {
        const worker = await activating(['pdkef-previous']);
        await dispatchActivate(worker);
        expect(fetchedPaths(worker)).toEqual([]);
        expect(worker.self.clients.claim).toHaveBeenCalled();
      });

      it('still activates and claims when a closure file fails', async () => {
        const worker = await activating([]);
        worker.site = (async (request) => {
          const { pathname } = new URL(request.url);
          return pathname === '/_astro/Merge.B1.js' ? new Response('no', { status: 503 }) : new Response('asset');
        });
        await expect(dispatchActivate(worker)).resolves.toBeDefined();
        expect(worker.self.clients.claim).toHaveBeenCalled();
      });
    });

    describe('the completion pass', () => {
      it('completes exactly the install set: what is missing from it, and nothing of any other page', async () => {
        const failing = ['/_astro/Redact.D1.js'];
        const site = (async (request) => {
          const url = request.url;
          if (url.endsWith('/precache-manifest.json')) return new Response(JSON.stringify({ version: 2, build: '__BUILD_ID__', shell: ['/'], pages: PAGES, hashes: {} }));
          const { pathname } = new URL(url);
          return failing.includes(pathname) ? new Response('no', { status: 503 }) : new Response('asset');
        });
        const worker = createWorker(site, ['pdkef-previous']);
        open(worker, '/redact/');
        await dispatchInstall(worker);
        expect(await worker.holds('https://pdkef.test/__pdkef/precache-complete/')).toBe(false);
        // The tab has since moved on: the pass still finishes what it started, from the pages its cache holds.
        open(worker);
        failing.length = 0;
        worker.requests.length = 0;
        expect(await dispatchMessage(worker, { type: 'pdkef:update-status' })).toMatchObject({ ready: false });
        await untilHeld(worker, '/__pdkef/precache-complete/');
        expect(fetchedPaths(worker)).toEqual(['/precache-manifest.json', '/_astro/Redact.D1.js']);
        expect(await worker.holds('https://pdkef.test/__pdkef/precache-complete/')).toBe(true);
        expect(await withoutInternal(worker)).toEqual(abs([...new Set(['/', ...REDACT])]).sort());
      });
    });

    it('treats a manifest without version 2 as having no URLs', async () => {
      const worker = createWorker((async () => new Response(JSON.stringify({ urls: ['/', '/sign/'] }))), []);
      await expect(dispatchInstall(worker)).rejects.toThrow(/no URLs/);
    });
  });

  it('revalidates provisioned font packs into an upgraded cache before deleting the old cache', async () => {
    const worker = createWorker((async (request) => new Response(`fresh:${new URL(request.url).pathname}`)));
    const pack = {
      family: 'Noto Sans SC',
      urls: ['/fonts/NotoSansSC-Regular.ttf', '/fonts/NotoSansSC-Bold.ttf'],
    };
    await worker.store(
      'https://pdkef.test/__pdkef/offline-font-pack/Noto%20Sans%20SC',
      new Response(JSON.stringify(pack)),
      'pdkef-previous',
    );
    await worker.store('https://pdkef.test/fonts/NotoSansSC-Regular.ttf', new Response('old regular'), 'pdkef-previous');
    await worker.store('https://pdkef.test/fonts/NotoSansSC-Bold.ttf', new Response('old bold'), 'pdkef-previous');

    await dispatchActivate(worker);

    expect(await (await worker.stored('https://pdkef.test/fonts/NotoSansSC-Regular.ttf')).text())
      .toBe('fresh:/fonts/NotoSansSC-Regular.ttf');
    expect(await worker.holds('https://pdkef.test/__pdkef/offline-font-pack/Noto%20Sans%20SC')).toBe(true);
    expect(worker.caches.delete).toHaveBeenCalledWith('pdkef-previous');
    expect(await worker.caches.keys()).not.toContain('pdkef-previous');
  });

  it('retains provisioned faces during an offline activation instead of silently dropping the pack', async () => {
    const worker = createWorker(offline);
    const pack = { family: 'Anek Telugu', urls: ['/fonts/AnekTelugu-Regular.ttf'] };
    await worker.store(
      'https://pdkef.test/__pdkef/offline-font-pack/Anek%20Telugu',
      new Response(JSON.stringify(pack)),
      'pdkef-previous',
    );
    await worker.store('https://pdkef.test/fonts/AnekTelugu-Regular.ttf', new Response('retained bytes'), 'pdkef-previous');

    await dispatchActivate(worker);

    expect(await (await worker.stored('https://pdkef.test/fonts/AnekTelugu-Regular.ttf')).text())
      .toBe('retained bytes');
    expect(await worker.holds('https://pdkef.test/__pdkef/offline-font-pack/Anek%20Telugu')).toBe(true);
  });

  it('serves a cached pathname for a query-route navigation while refreshing in the background', async () => {
    const worker = createWorker(manifestResponder(['/'], () => new Response('fresh sign page'), {}, { '/sign/': pageHash('fresh sign page') }));
    await dispatchInstall(worker);
    await worker.store('https://pdkef.test/sign/', new Response('cached sign page'));
    const request = navigation('https://pdkef.test/sign/?action=open');

    const { response, background } = await dispatchFetch(worker, request);
    expect(await response.text()).toBe('cached sign page');

    await Promise.all(background);
    expect(worker.requests.map((asked) => asked.url)).toContain(request.url);
    expect(await (await worker.stored('https://pdkef.test/sign/')).text()).toBe('fresh sign page');
  });

  // MEM-40: the home page answers only when its whole closure is cached (here the closure is the document alone).
  it('falls back to a complete cached root when an uncached navigation has no network', async () => {
    const worker = createWorker(offline);
    await worker.store('https://pdkef.test/', new Response('cached home'));
    await worker.store('https://pdkef.test/__pdkef/manifest/', new Response(JSON.stringify({ hashes: {}, pages: { '/': ['/'] } })));

    const { response } = await dispatchFetch(worker, navigation('https://pdkef.test/new-route/'));

    expect(await response.text()).toBe('cached home');
  });
});

/**
 * DEMO-03: Web Share Target has no server to answer the POST Android's share
 * sheet sends (see manifest.webmanifest's share_target), so this worker is
 * the only thing that ever sees the shared file. It must lift the bytes out
 * of the multipart body into the exact IndexedDB handoff record
 * draftStore.ts's saveHandoff('sign', ...) already writes (same DB/store/key
 * shape), so the Sign tool's existing takeHandoff('sign') mount-time restore
 * - the same path FileDropzone's home-page drop already feeds - picks it up
 * with no changes on that side, and never touch the network with the file.
 */
describe('Web Share Target (DEMO-03)', () => {
  // What the share sheet sends: a multipart POST, which a page load made by script cannot be.
  const shareRequest = (formData) => navigation('https://pdkef.test/share-target/', { method: 'POST', body: formData });
  const signHandoff = async (worker) => (await handoffs(worker)).find((record) => record.tool === 'handoff:sign');

  it('stores a shared PDF as the Sign tool handoff record and redirects there', async () => {
    const worker = createWorker();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const formData = new FormData();
    formData.set('pdf', new File([bytes], 'contract.pdf', { type: 'application/pdf' }));

    const { response } = await dispatchFetch(worker, shareRequest(formData));

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://pdkef.test/sign/');

    const record = await signHandoff(worker);
    expect(record.fileName).toBe('contract.pdf');
    expect(record.fileType).toBe('application/pdf');
    expect(new Uint8Array(record.fileBytes)).toEqual(bytes);
    expect(typeof record.savedAt).toBe('number');
  });

  it('defaults name/type when the shared file omits them, rather than dropping it', async () => {
    const worker = createWorker();
    // A multipart body whose file part has no filename and no type, as a share can send; undici's own encoder drops an empty filename.
    const body = '--pdkef\r\nContent-Disposition: form-data; name="pdf"; filename=""\r\nContent-Type: \r\n\r\n\t\r\n--pdkef--\r\n';
    const request = navigation('https://pdkef.test/share-target/', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=pdkef' }, body });

    await dispatchFetch(worker, request);

    const record = await signHandoff(worker);
    expect(record.fileName).toBe('shared.pdf');
    expect(record.fileType).toBe('application/pdf');
  });

  it('still redirects to the Sign tool when the share carried no usable file', async () => {
    const worker = createWorker();

    const { response } = await dispatchFetch(worker, shareRequest(new FormData()));

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://pdkef.test/sign/');
    expect(await handoffs(worker)).toEqual([]);
  });

  it('keeps nothing when the shared file has no bytes', async () => {
    const worker = createWorker();
    const formData = new FormData();
    formData.set('pdf', new File([], 'empty.pdf', { type: 'application/pdf' }));

    const { response } = await dispatchFetch(worker, shareRequest(formData));

    expect(response.status).toBe(303);
    expect(await handoffs(worker)).toEqual([]);
  });

  it('leaves a GET of the share path to the normal page handling', async () => {
    const worker = createWorker(() => new Response('share page'));

    const { response } = await dispatchFetch(worker, navigation('https://pdkef.test/share-target/'));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('share page');
  });

  it('redirects rather than throwing when the POST body cannot be read', async () => {
    const worker = createWorker();
    const request = navigation('https://pdkef.test/share-target/', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=pdkef' },
      body: 'a body that is not multipart',
    });

    const { response } = await dispatchFetch(worker, request);

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://pdkef.test/sign/');
  });

  it('never intercepts a POST to any other path, leaving normal request handling to the browser', async () => {
    const worker = createWorker();
    const request = navigation('https://pdkef.test/some-other-path/', { method: 'POST' });

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
    const worker = createWorker(() => new Response('font bytes'));
    const request = new Request('https://pdkef.test/fonts/Pacifico-Regular.ttf', { mode: 'no-cors' });

    const { response } = await dispatchFetch(worker, request);

    expect(await response.text()).toBe('font bytes');
    expect(await worker.holds('https://pdkef.test/fonts/Pacifico-Regular.ttf')).toBe(true);
  });
});

// The minified copy is what actually ships in dist/sw.js (see
// generate-precache-manifest.mjs). It must stay a valid classic worker
// script, keep the __BUILD_ID__ placeholder for that same script to
// substitute, and never gain a skipWaiting() call the minifier didn't put
// there (see the skipWaiting() invariant in service-worker.md): the MEM-10
// grant and MEM-13's gated force are the only two.
describe('minified service worker', () => {
  it('evaluates in the same harness and keeps the invariants that matter', async () => {
    const worker = createWorker(() => new Response('font bytes'), ['pdkef-previous'], minifiedWorkerSource);
    const request = new Request('https://pdkef.test/fonts/Pacifico-Regular.ttf', { mode: 'no-cors' });

    const { response } = await dispatchFetch(worker, request);

    expect(await response.text()).toBe('font bytes');
    expect(minifiedWorkerSource).toContain('__BUILD_ID__');
    expect(minifiedWorkerSource.match(/skipWaiting\s*\(/g)).toHaveLength(2);
    // e2e/offline/twoBuildServer.js fakes a critical deploy by raising the one literal version the
    // worker compares with (MEM-29: a second call site left the forced takeover at the old one).
    expect(minifiedWorkerSource.match(/isCriticalOver\(\d+,/g)).toHaveLength(1);
    expect(minifiedWorkerSource.length).toBeLessThan(workerSource.length * 0.6);
  });
});

// A fake open tab. `behavior` scripts its answer to the busy survey: 'busy',
// 'idle', or 'never' (a frozen tab, or a page from before MEM-10).
const settle = () => new Promise((resolve) => realSetTimeout(resolve, 20));
const fakeWindow = (id, behavior = 'idle', url = `https://pdkef.test/${id}/`) => {
  let asked;
  const window = {
    id,
    url,
    /** What the worker sent this tab: [message, ports] each. */
    sent: [],
    /** Settles once the worker has asked this tab something. */
    asked: new Promise((resolveAsked) => { asked = resolveAsked; }),
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: Node has no window client, so the tab and its scripted answer are mocks.
    postMessage: vi.fn((message, ports) => {
      window.sent.push([message, ports]);
      asked();
      if (behavior === 'never') return;
      ports[0].postMessage({ busy: behavior === 'busy' });
    }),
  };
  return window;
};

// Runs `start()` under fake timers, waits until the worker has asked the silent tab (its timer is
// running by then), then jumps past every worker timeout so a tab that never answers costs no real time.
async function withSilentTimeouts(start, asked) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const pending = start();
    await orGiveUp(asked);
    // Replies of the tabs that do answer travel over real message ports.
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    return await pending;
  } finally {
    vi.useRealTimers();
  }
}

// A worker with no readiness marker and a three-URL manifest, '/' and '/sign/' already cached.
// `failing` lists pathnames that answer 503. Returns the worker and its fetched pathnames.
async function buildIncompleteWorker(source, windows, failing = []) {
  const fetched = [];
  const site = (async (request) => {
    const url = request.url;
    if (url.endsWith('/precache-manifest.json')) return new Response(JSON.stringify({ version: 2, build: '__BUILD_ID__', pages: { '/': ['/', '/sign/', '/_astro/app.js'] }, hashes: {} }));
    const pathname = new URL(url).pathname;
    fetched.push(pathname);
    return failing.includes(pathname) ? new Response('no', { status: 503 }) : new Response('asset');
  });
  const worker = createWorker(site, ['pdkef-previous'], source);
  worker.windows = windows;
  await worker.store('https://pdkef.test/', new Response('home'));
  await worker.store('https://pdkef.test/sign/', new Response('sign'));
  return { worker, fetched };
}
const PRECACHE_MARKER = 'https://pdkef.test/__pdkef/precache-complete/';

// MEM-10: skipWaiting() runs only on the active worker's message, after every tab answered.
describe.each([['source', workerSource], ['minified source', minifiedWorkerSource]])('skip-waiting message (%s)', (_label, source) => {
  const SKIP = 'pdkef:skip-waiting';
  const build = async (windows) => {
    const worker = createWorker(() => new Response('x'), ['pdkef-previous'], source);
    worker.windows = windows;
    await worker.store('https://pdkef.test/__pdkef/precache-complete/', new Response('ok'));
    return worker;
  };

  it('skips waiting and replies ok when every window is idle', async () => {
    const worker = await build([fakeWindow('a'), fakeWindow('b')]);
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: true, ready: true, windows: 2, busy: 0, silent: 0 });
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('asks each window with a busy-query and a reply port', async () => {
    const a = fakeWindow('a');
    await dispatchMessage(await build([a]), { type: SKIP });
    expect(a.sent).toEqual([[{ type: 'pdkef:busy-query' }, [expect.anything()]]]);
  });

  it('refuses when one window is busy', async () => {
    const worker = await build([fakeWindow('a'), fakeWindow('b', 'busy')]);
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: false, ready: true, windows: 2, busy: 1, silent: 0 });
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('refuses when one window never answers', async () => {
    const silent = fakeWindow('b', 'never');
    const worker = await build([fakeWindow('a'), silent]);
    const reply = await withSilentTimeouts(() => dispatchMessage(worker, { type: SKIP }), silent.asked);
    expect(reply).toEqual({ ok: false, ready: true, windows: 2, busy: 0, silent: 1 });
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('does not ask or count blob: windows', async () => {
    const blob = fakeWindow('blob', 'busy', 'blob:https://pdkef.test/abc');
    const worker = await build([fakeWindow('a'), blob]);
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: true, ready: true, windows: 1, busy: 0, silent: 0 });
    expect(blob.sent).toEqual([]);
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('refuses without asking any window when the build is not fully precached', async () => {
    const a = fakeWindow('a');
    const worker = await build([a]);
    await worker.drop('https://pdkef.test/__pdkef/precache-complete/');
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: false, ready: false, windows: 0, busy: 0, silent: 0 });
    expect(a.sent).toEqual([]);
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('refuses without asking any window while offline', async () => {
    const a = fakeWindow('a');
    const worker = await build([a]);
    worker.self.navigator.onLine = false;
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: false, ready: false, windows: 0, busy: 0, silent: 0 });
    expect(a.sent).toEqual([]);
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('posts the reply before it calls skipWaiting', async () => {
    const worker = await build([fakeWindow('a')]);
    const waits = [];
    worker.listeners.get('message')({
      data: { type: SKIP },
      ports: [{ postMessage: () => worker.order.push('reply') }],
      waitUntil: (promise) => waits.push(Promise.resolve(promise)),
    });
    await Promise.all(waits);
    expect(worker.order).toEqual(['reply', 'skipWaiting']);
  });

  it('while not ready and online, replies not-ready and fetches only the missing URLs, then marks complete', async () => {
    const { worker, fetched } = await buildIncompleteWorker(source, [fakeWindow('a')]);
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: false, ready: false, windows: 0, busy: 0, silent: 0 });
    expect(fetched).toEqual(['/_astro/app.js']);
    expect(await worker.holds(PRECACHE_MARKER)).toBe(true);
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: true, ready: true, windows: 1, busy: 0, silent: 0 });
  });

  it('writes no marker while a URL still fails', async () => {
    const { worker } = await buildIncompleteWorker(source, [], ['/_astro/app.js']);
    await dispatchMessage(worker, { type: SKIP });
    expect(await worker.holds(PRECACHE_MARKER)).toBe(false);
    expect((await dispatchMessage(worker, { type: SKIP })).ready).toBe(false);
  });

  it('fetches nothing while offline', async () => {
    const { worker, fetched } = await buildIncompleteWorker(source, []);
    worker.self.navigator.onLine = false;
    await dispatchMessage(worker, { type: SKIP });
    expect(fetched).toEqual([]);
    expect(await worker.holds(PRECACHE_MARKER)).toBe(false);
  });

  it('does not ask or count windows whose path is not a page (sitemap, robots)', async () => {
    const sitemap = fakeWindow('s', 'busy', 'https://pdkef.test/sitemap.xml');
    const robots = fakeWindow('r', 'busy', 'https://pdkef.test/robots.txt');
    const worker = await build([fakeWindow('a'), sitemap, robots]);
    expect(await dispatchMessage(worker, { type: SKIP })).toEqual({ ok: true, ready: true, windows: 1, busy: 0, silent: 0 });
    expect(sitemap.sent).toEqual([]);
    expect(robots.sent).toEqual([]);
  });

  it('never skips waiting for a font-pack message', async () => {
    const worker = await build([fakeWindow('a')]);
    await dispatchMessage(worker, { type: 'pdkef:font-pack-status' });
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('runs without a reply port and does not throw', async () => {
    const worker = await build([fakeWindow('a')]);
    const waits = [];
    worker.listeners.get('message')({ data: { type: SKIP }, waitUntil: (p) => waits.push(Promise.resolve(p)) });
    await Promise.all(waits);
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });
});

describe.each([['source', workerSource], ['minified source', minifiedWorkerSource]])('install readiness marker (%s)', (_label, source) => {
  const MARKER = 'https://pdkef.test/__pdkef/precache-complete/';
  const install = async (perUrl) => {
    const worker = createWorker(manifestResponder(['/', '/sign/'], perUrl), ['pdkef-previous'], source);
    await dispatchInstall(worker);
    return worker;
  };

  it('is written when every URL precaches', async () => {
    expect(await (await install()).holds(MARKER)).toBe(true);
  });

  it('is not written when one URL misses', async () => {
    const worker = await install((pathname) => (pathname === '/sign/' ? new Response('no', { status: 503 }) : new Response('asset')));
    expect(await worker.holds(MARKER)).toBe(false);
  });
});

describe.each([['source', workerSource], ['minified source', minifiedWorkerSource]])('update status message (%s)', (_label, source) => {
  const STATUS = 'pdkef:update-status';
  const build = async (windows, marker = true) => {
    const worker = createWorker(() => new Response('x'), ['pdkef-previous'], source);
    worker.windows = windows;
    if (marker) await worker.store('https://pdkef.test/__pdkef/precache-complete/', new Response('ok'));
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
    const worker = await build([asker, fakeWindow('a'), fakeWindow('b', 'busy'), fakeWindow('blob', 'busy', 'blob:https://pdkef.test/x')]);
    expect(await dispatchStatus(worker, 'me')).toEqual({ ready: true, windows: 2, busy: 1, silent: 0 });
    expect(asker.sent).toEqual([]);
  });

  it('counts a window that never answers as silent', async () => {
    const silent = fakeWindow('a', 'never');
    const worker = await build([fakeWindow('me'), silent]);
    expect(await withSilentTimeouts(() => dispatchStatus(worker, 'me'), silent.asked)).toEqual({ ready: true, windows: 1, busy: 0, silent: 1 });
  });

  it('is not ready without the marker, and asks no window', async () => {
    const a = fakeWindow('a');
    expect(await dispatchStatus(await build([a], false), 'me')).toEqual({ ready: false, windows: 0, busy: 0, silent: 0 });
    expect(a.sent).toEqual([]);
  });

  it('while not ready and online, completes the precache in the background and then reports ready', async () => {
    const { worker, fetched } = await buildIncompleteWorker(source, [fakeWindow('a')]);
    expect(await dispatchStatus(worker, 'me')).toEqual({ ready: false, windows: 0, busy: 0, silent: 0 });
    expect(fetched).toEqual(['/_astro/app.js']);
    expect(await dispatchStatus(worker, 'me')).toEqual({ ready: true, windows: 1, busy: 0, silent: 0 });
  });

  it('leaves the build not ready while a URL still fails', async () => {
    const { worker } = await buildIncompleteWorker(source, [], ['/_astro/app.js']);
    await dispatchStatus(worker, 'me');
    expect(await worker.holds(PRECACHE_MARKER)).toBe(false);
  });

  it('fetches nothing for the missing URLs while offline', async () => {
    const { worker, fetched } = await buildIncompleteWorker(source, []);
    worker.self.navigator.onLine = false;
    await dispatchStatus(worker, 'me');
    expect(fetched).toEqual([]);
  });

  it('does not ask or count non-page windows', async () => {
    const sitemap = fakeWindow('s', 'busy', 'https://pdkef.test/sitemap.xml');
    const worker = await build([fakeWindow('a'), sitemap, fakeWindow('r', 'busy', 'https://pdkef.test/robots.txt')]);
    expect(await dispatchStatus(worker, 'me')).toEqual({ ready: true, windows: 1, busy: 0, silent: 0 });
    expect(sitemap.sent).toEqual([]);
  });

  it('is not ready offline, and asks no window', async () => {
    const a = fakeWindow('a');
    const worker = await build([a]);
    worker.self.navigator.onLine = false;
    expect(await dispatchStatus(worker, 'me')).toEqual({ ready: false, windows: 0, busy: 0, silent: 0 });
    expect(a.sent).toEqual([]);
  });
});

describe.each([['source', workerSource], ['minified source', minifiedWorkerSource]])('silent takeover on navigation (%s)', (_label, source) => {
  const nav = navigation('https://pdkef.test/sign/');
  const build = async ({ answer = { ok: true }, waiting = true } = {}) => {
    const worker = createWorker(() => new Response('fresh'), ['pdkef-previous'], source);
    await worker.store('https://pdkef.test/sign/', new Response('cached sign page'));
    // A cached page is servable only with its whole closure (MEM-28, MEM-35): here an empty one.
    await worker.store('https://pdkef.test/__pdkef/manifest/', new Response(JSON.stringify({ hashes: {}, pages: { '/sign/': [] } })));
    // What the worker sent the waiting worker: [message, ports] each.
    const sent = [];
    let asked;
    const askedOnce = new Promise((resolveAsked) => { asked = resolveAsked; });
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: Node has no waiting worker, so it and its scripted answer are mocks.
    const postMessage = vi.fn((data, ports) => {
      sent.push([data, ports]);
      asked();
      if (answer) ports[0].postMessage(answer);
    });
    if (waiting) worker.self.registration.waiting = { postMessage };
    return { worker, sent, asked: askedOnce };
  };

  it('asks the waiting worker to take over and answers with the takeover page when it agrees', async () => {
    const { worker, sent } = await build();
    const { response } = await dispatchFetch(worker, nav);
    expect(sent).toEqual([[{ type: 'pdkef:skip-waiting' }, [expect.anything()]]]);
    const html = await response.text();
    expect(html).toContain('http-equiv="refresh"');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('the takeover page retries by itself, under a CSP that allows exactly that script', async () => {
    const { worker } = await build();
    const { response } = await dispatchFetch(worker, nav);
    const html = await response.text();
    const scripts = [...html.matchAll(/<script>([^<]*)<\/script>/g)].map((m) => m[1]);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain('location.reload()');
    const hash = crypto.createHash('sha256').update(scripts[0]).digest('base64');
    expect(response.headers.get('Content-Security-Policy')).toBe(`default-src 'none'; script-src 'sha256-${hash}'`);
  });

  it('falls through when the waiting worker refuses', async () => {
    const { worker } = await build({ answer: { ok: false } });
    const { response } = await dispatchFetch(worker, nav);
    expect(await response.text()).toBe('cached sign page');
  });

  it('falls through when the waiting worker never replies', async () => {
    const { worker, asked } = await build({ answer: null });
    const { response } = await withSilentTimeouts(() => dispatchFetch(worker, nav), asked);
    expect(await response.text()).toBe('cached sign page');
  });

  it('posts nothing without a waiting worker', async () => {
    const { worker, sent } = await build({ waiting: false });
    const { response } = await dispatchFetch(worker, nav);
    expect(sent).toEqual([]);
    expect(await response.text()).toBe('cached sign page');
  });

  it('serves a second navigation within the cooldown normally, without asking again', async () => {
    const { worker, sent } = await build();
    await dispatchFetch(worker, nav);
    const { response } = await dispatchFetch(worker, nav);
    expect(sent).toHaveLength(1);
    expect(await response.text()).toBe('cached sign page');
  });

  it('posts nothing to the waiting worker while offline, and serves the cached page', async () => {
    const { worker, sent } = await build();
    worker.self.navigator.onLine = false;
    const { response } = await dispatchFetch(worker, nav);
    expect(sent).toEqual([]);
    expect(await response.text()).toBe('cached sign page');
  });

  it('after a reply with unanswered tabs, a second navigation does not ask again', async () => {
    const { worker, sent } = await build({ answer: { ok: false, ready: true, windows: 1, busy: 0, silent: 1 } });
    await dispatchFetch(worker, nav);
    await dispatchFetch(worker, nav);
    expect(sent).toHaveLength(1);
  });

  it('after a reply with only busy tabs, a second navigation asks again', async () => {
    const { worker, sent } = await build({ answer: { ok: false, ready: true, windows: 1, busy: 1, silent: 0 } });
    await dispatchFetch(worker, nav);
    await dispatchFetch(worker, nav);
    expect(sent).toHaveLength(2);
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
  // Only its pure functions are used here, so the caches it opened are emptied again.
  let context;
  beforeEach(async () => {
    ({ context } = createWorker(undefined, ['pdkef-previous'], plainSource));
    await clearCaches();
  });

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
    let asked;
    const window = {
      id,
      url,
      reply: null,
      sent: [],
      asked: new Promise((resolveAsked) => { asked = resolveAsked; }),
      // oxlint-disable-next-line landmines/no-test-doubles -- Forced: Node has no window client, so the tab and its scripted answer are mocks.
      postMessage: vi.fn((message, ports) => {
        window.sent.push([message, ports]);
        window.reply = () => ports[0].postMessage({ ready: true });
        if (behavior === 'ready') window.reply();
        asked();
      }),
    };
    return window;
  };
  const build = async ({ windows = [], waiting = true, marker = true, source = criticalSource, version = SHIPPED_CRITICAL + 1, keys = [`pdkef-c${SHIPPED_CRITICAL}-previous`] } = {}) => {
    const worker = createWorker(() => new Response('x'), keys, source, version);
    worker.windows = windows;
    if (marker) await worker.store('https://pdkef.test/__pdkef/precache-complete/', new Response('ok'));
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
    const worker = await build({ windows: [a, b, sitemap] });
    const done = runCheck(worker);
    await orGiveUp(Promise.all([a.asked, b.asked]));
    expect(a.sent).toEqual([[UPDATE, [expect.anything()]]]);
    expect(b.sent).toEqual([[UPDATE, [expect.anything()]]]);
    expect(sitemap.sent).toEqual([]);
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
    b.reply();
    await done;
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('skips waiting when no page is open', async () => {
    const worker = await build();
    await runCheck(worker);
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('skips waiting at the cap when a tab never answers, and not before', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const frozen = criticalWindow('frozen', 'never');
      const worker = await build({ windows: [criticalWindow('a'), frozen] });
      const done = runCheck(worker);
      await orGiveUp(frozen.asked);
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
    const worker = await build({ windows: [a] });
    const first = runCheck(worker);
    await orGiveUp(a.asked);
    const second = runCheck(worker);
    await settle();
    expect(a.sent).toHaveLength(1);
    a.reply();
    await Promise.all([first, second]);
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('does nothing when this worker is not the waiting one', async () => {
    const a = criticalWindow('a');
    const worker = await build({ windows: [a], waiting: false });
    await runCheck(worker);
    expect(a.sent).toEqual([]);
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('does nothing when another worker is the waiting one', async () => {
    const a = criticalWindow('a');
    const worker = await build({ windows: [a] });
    worker.self.serviceWorker = {};
    await runCheck(worker);
    expect(a.sent).toEqual([]);
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('does nothing offline, asks nobody and fetches nothing', async () => {
    const a = criticalWindow('a');
    const worker = await build({ windows: [a], marker: false });
    worker.self.navigator.onLine = false;
    await runCheck(worker);
    expect(a.sent).toEqual([]);
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
    expect(worker.requests).toEqual([]);
  });

  it('does nothing while the build is not fully precached and a URL still fails', async () => {
    const a = criticalWindow('a');
    const worker = await build({ windows: [a], marker: false });
    worker.site = (async (request) => (request.url.endsWith('/precache-manifest.json')
      ? new Response(JSON.stringify({ version: 2, build: '__BUILD_ID__', shell: ['/', '/sign/'], pages: {}, hashes: {} }))
      : new Response('no', { status: 503 })));
    await runCheck(worker);
    expect(a.sent).toEqual([]);
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('finishes a missing precache online and then forces', async () => {
    const worker = await build({ marker: false });
    worker.site = (async (request) => (request.url.endsWith('/precache-manifest.json')
      ? new Response(JSON.stringify({ version: 2, build: '__BUILD_ID__', shell: ['/', '/sign/'], pages: {}, hashes: {} }))
      : new Response('asset')));
    await runCheck(worker);
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a build that is not critical over the one cached', async () => {
    const a = criticalWindow('a');
    const equal = await build({ windows: [a], keys: [`pdkef-c${SHIPPED_CRITICAL + 1}-previous`] });
    await runCheck(equal);
    await clearCaches();
    const same = await build({ windows: [a], source: plainSource, version: SHIPPED_CRITICAL });
    await runCheck(same);
    expect(a.sent).toEqual([]);
    expect(equal.self.skipWaiting).not.toHaveBeenCalled();
    expect(same.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('does not skip waiting when it stopped being the waiting worker, or went offline, during the wait', async () => {
    const replaced = criticalWindow('a', 'late');
    const first = await build({ windows: [replaced] });
    const replacedDone = runCheck(first);
    await orGiveUp(replaced.asked);
    first.self.registration.waiting = null;
    replaced.reply();
    await replacedDone;
    expect(first.self.skipWaiting).not.toHaveBeenCalled();

    const dropped = criticalWindow('b', 'late');
    const second = await build({ windows: [dropped] });
    const droppedDone = runCheck(second);
    await orGiveUp(dropped.asked);
    second.self.navigator.onLine = false;
    dropped.reply();
    await droppedDone;
    expect(second.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('runs at the end of install without holding the install open', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const frozen = criticalWindow('frozen', 'never');
      const worker = await build({ windows: [frozen], marker: false });
      worker.site = manifestResponder(['/', '/sign/']);
      await dispatchInstall(worker);
      await orGiveUp(frozen.asked);
      expect(frozen.sent).toEqual([[UPDATE, [expect.anything()]]]);
      expect(worker.self.skipWaiting).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(75_000);
      await orGiveUp(worker.skipped);
      expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for the install to settle into waiting before it forces', async () => {
    const a = criticalWindow('a');
    const worker = await build({ windows: [a], waiting: false, marker: false });
    worker.site = (manifestResponder(['/', '/sign/']));
    let statechange;
    worker.self.serviceWorker = { state: 'installing', addEventListener: (_name, listener) => { statechange = listener; } };
    await dispatchInstall(worker);
    await settle();
    expect(a.sent).toEqual([]);
    worker.self.serviceWorker.state = 'installed';
    worker.self.registration.waiting = worker.self.serviceWorker;
    statechange();
    await orGiveUp(a.asked);
    await orGiveUp(worker.skipped);
    expect(a.sent).toHaveLength(1);
    expect(worker.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('never runs for a build at the shipped critical version, on install or on a check', async () => {
    const a = criticalWindow('a');
    const worker = await build({ windows: [a], source: plainSource, version: SHIPPED_CRITICAL });
    worker.site = (manifestResponder(['/', '/sign/']));
    await dispatchInstall(worker);
    await runCheck(worker);
    expect(a.sent).toEqual([]);
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });
});

// MEM-22: a build's cache holds only that build's files.
describe.each([['source', workerSource], ['minified source', minifiedWorkerSource]])('one build per cache (%s)', (_label, source) => {
  const OTHER = { version: 2, build: 'another-build', shell: ['/', '/sign/'], pages: {} };
  const NO_BUILD = { version: 2, shell: ['/', '/sign/'], pages: {} };
  const NO_HASHES = { version: 2, build: '__BUILD_ID__', shell: ['/', '/sign/'], pages: {} };
  const BAD_HASHES = { version: 2, build: '__BUILD_ID__', shell: ['/', '/sign/'], pages: {}, hashes: 'nope' };
  const MANIFEST_URL = '/precache-manifest.json';
  const respondWith = (manifest, fetched = []) => (async (request) => {
    const pathname = new URL(request.url).pathname;
    if (pathname === MANIFEST_URL) return new Response(JSON.stringify(manifest));
    fetched.push(pathname);
    return new Response('asset');
  });

  it.each([['another build', OTHER], ['no build id', NO_BUILD], ['no hashes', NO_HASHES], ['hashes that are not an object', BAD_HASHES]])('install rejects a manifest with %s and caches none of its URLs', async (_name, manifest) => {
    const fetched = [];
    const worker = createWorker(respondWith(manifest, fetched), [], source);
    await expect(dispatchInstall(worker)).rejects.toThrow();
    expect(fetched).toEqual([]);
    expect((await worker.storedUrls())).toEqual([]);
  });

  it('a waiting worker completing its precache against another build marks nothing and caches nothing', async () => {
    const fetched = [];
    const worker = createWorker(respondWith(OTHER, fetched), ['pdkef-previous'], source);
    worker.windows = [];
    expect(await dispatchMessage(worker, { type: 'pdkef:skip-waiting' })).toMatchObject({ ok: false, ready: false });
    expect(fetched).toEqual([]);
    expect(await worker.holds('https://pdkef.test/__pdkef/precache-complete/')).toBe(false);
    expect((await worker.storedUrls())).toEqual([]);
  });

  describe('install checks unhashed files against the manifest', () => {
    const PNG = () => new Response('icon bytes', { status: 200, headers: { 'Content-Type': 'image/png', 'X-Keep': 'yes' } });
    const serve = (map) => (pathname) => (pathname in map ? map[pathname]() : new Response('asset'));
    const urls = ['/', '/sign/', '/icons/icon-512.png', '/_astro/app.js'];

    it('does not store a page whose bytes differ from its hash, and does not mark the build complete', async () => {
      const hashes = { '/': pageHash('home'), '/sign/': pageHash('sign of this build') };
      const worker = createWorker(manifestResponder(urls, serve({ '/': () => new Response('home'), '/sign/': () => new Response('sign of a newer build') }), {}, hashes), [], source);
      await dispatchInstall(worker);
      expect(await worker.holds('https://pdkef.test/sign/')).toBe(false);
      expect(await worker.holds('https://pdkef.test/')).toBe(true);
      expect(await worker.holds('https://pdkef.test/_astro/app.js')).toBe(true);
      expect(await worker.holds('https://pdkef.test/__pdkef/precache-complete/')).toBe(false);
    });

    it('rejects the install when / does not match its hash', async () => {
      const worker = createWorker(manifestResponder(urls, serve({ '/': () => new Response('newer home') }), {}, { '/': pageHash('home') }), [], source);
      await expect(dispatchInstall(worker)).rejects.toThrow();
      expect(await worker.holds('https://pdkef.test/')).toBe(false);
    });

    it('does not store a non-page unhashed file with a mismatching hash', async () => {
      const worker = createWorker(manifestResponder(urls, serve({ '/icons/icon-512.png': PNG }), {}, { '/icons/icon-512.png': pageHash('other bytes') }), [], source);
      await dispatchInstall(worker);
      expect(await worker.holds('https://pdkef.test/icons/icon-512.png')).toBe(false);
      expect(await worker.holds('https://pdkef.test/__pdkef/precache-complete/')).toBe(false);
    });

    it('stores a matching unhashed file with its status and headers', async () => {
      const worker = createWorker(manifestResponder(urls, serve({ '/icons/icon-512.png': PNG }), {}, { '/icons/icon-512.png': pageHash('icon bytes') }), [], source);
      await dispatchInstall(worker);
      const stored = await worker.stored('https://pdkef.test/icons/icon-512.png');
      expect(await stored.text()).toBe('icon bytes');
      expect(stored.headers.get('X-Keep')).toBe('yes');
      expect(stored.headers.get('Content-Type')).toBe('image/png');
    });
  });

  describe('every other write path checks the same hashes', () => {
    const asset = (path) => new Request(`https://pdkef.test${path}`, { mode: 'no-cors' });
    const COMPLETE = 'https://pdkef.test/__pdkef/precache-complete/';
    // Install with the icon missing (its bytes were another build's), then let the page request it.
    const installed = async (listed, bytes) => {
      const serve = (pathname) => (pathname.startsWith('/icons/') || pathname.startsWith('/fonts/') ? new Response(bytes) : new Response('asset'));
      const worker = createWorker(manifestResponder(['/', '/icons/icon-512.png'], serve, {}, listed), [], source);
      await dispatchInstall(worker);
      return worker;
    };

    it('serves a listed asset with other bytes but does not store it, and the build stays incomplete', async () => {
      const worker = await installed({ '/icons/icon-512.png': pageHash('this build') }, 'newer build');
      const { response, background } = await dispatchFetch(worker, asset('/icons/icon-512.png'));
      expect(await response.text()).toBe('newer build');
      await Promise.all(background);
      expect(await worker.holds('https://pdkef.test/icons/icon-512.png')).toBe(false);
      worker.windows = [];
      await dispatchMessage(worker, { type: 'pdkef:skip-waiting' });
      expect(await worker.holds('https://pdkef.test/icons/icon-512.png')).toBe(false);
      expect(await worker.holds(COMPLETE)).toBe(false);
    });

    it('stores a listed asset whose bytes match', async () => {
      const worker = await installed({ '/icons/other.png': pageHash('x') }, 'this build');
      const { background } = await dispatchFetch(worker, asset('/icons/icon-512.png'));
      await Promise.all(background);
      expect(await (await worker.stored('https://pdkef.test/icons/icon-512.png')).text()).toBe('this build');
    });

    it('stores a matching listed asset the install missed', async () => {
      const worker = await installed({ '/icons/icon-512.png': pageHash('this build') }, 'this build');
      await worker.drop('https://pdkef.test/icons/icon-512.png');
      const { background } = await dispatchFetch(worker, asset('/icons/icon-512.png'));
      await Promise.all(background);
      expect(await (await worker.stored('https://pdkef.test/icons/icon-512.png')).text()).toBe('this build');
    });

    it('stores an asset the manifest does not list', async () => {
      const worker = await installed({ '/icons/icon-512.png': pageHash('this build') }, 'this build');
      const { background } = await dispatchFetch(worker, asset('/_astro/late.js'));
      await Promise.all(background);
      expect(await (await worker.stored('https://pdkef.test/_astro/late.js')).text()).toBe('asset');
    });

    describe('font packs', () => {
      const FONT = '/fonts/Heebo-Regular.ttf';
      const KEY = 'https://pdkef.test/fonts/Heebo-Regular.ttf';
      const pack = { family: 'Heebo', urls: [FONT] };
      const MARKER = 'https://pdkef.test/__pdkef/offline-font-pack/Heebo';
      const withManifest = async (fontBytesOnNetwork, hash) => {
        const site = manifestResponder(['/'], (pathname) => (pathname === FONT ? new Response(fontBytesOnNetwork) : new Response('asset')), {}, { [FONT]: pageHash(hash) });
        const worker = createWorker(site, ['pdkef-previous'], source);
        await dispatchInstall(worker);
        return worker;
      };

      it('does not carry over a listed font whose old bytes do not match, nor mark the pack', async () => {
        const worker = await withManifest('this build font', 'this build font');
        await worker.drop(KEY);
        await worker.store(MARKER, new Response(JSON.stringify(pack)), 'pdkef-previous');
        await worker.store(KEY, new Response('older font'), 'pdkef-previous');
        worker.site = offline;
        await dispatchActivate(worker);
        expect(await worker.holds(KEY)).toBe(false);
        expect(await worker.holds(MARKER)).toBe(false);
      });

      it('stores the fetched font instead when it matches', async () => {
        const worker = await withManifest('this build font', 'this build font');
        await worker.drop(KEY);
        await worker.store(MARKER, new Response(JSON.stringify(pack)), 'pdkef-previous');
        await worker.store(KEY, new Response('older font'), 'pdkef-previous');
        await dispatchActivate(worker);
        expect(await (await worker.stored(KEY)).text()).toBe('this build font');
        expect(await worker.holds(MARKER)).toBe(true);
      });

      it('does not store a provisioned font whose bytes do not match, and the pack is not complete', async () => {
        const worker = await withManifest('newer font', 'this build font');
        await worker.drop(KEY);
        const result = await dispatchMessage(worker, { type: 'pdkef:font-pack-provision', packs: [pack] });
        expect(result.ok).toBe(false);
        expect(await worker.holds(KEY)).toBe(false);
        expect(await worker.holds(MARKER)).toBe(false);
      });
    });
  });

  describe('an unreadable stored manifest', () => {
    const MANIFEST_KEY = 'https://pdkef.test/__pdkef/manifest/';
    const asset = (path) => new Request(`https://pdkef.test${path}`, { mode: 'no-cors' });
    const navigate = (path) => navigation(`https://pdkef.test${path}`);
    const install = async (hashes) => {
      const serve = (pathname) => (pathname.startsWith('/icons/') ? new Response('newer build') : new Response('page'));
      const worker = createWorker(manifestResponder(['/', '/icons/icon-512.png'], serve, {}, hashes), [], source);
      await dispatchInstall(worker);
      return worker;
    };
    // Makes reading the stored manifest reject until the returned function is called.
    const breakManifestRead = () => {
      const real = CachePrototype.match;
      // oxlint-disable-next-line landmines/no-test-doubles -- Forced: real storage never fails to read an entry it holds.
      const spy = vi.spyOn(CachePrototype, 'match').mockImplementation(function match(request, options) {
        if ((typeof request === 'string' ? request : request.url) === MANIFEST_KEY) throw new Error('unreadable');
        return real.call(this, request, options);
      });
      return () => spy.mockRestore();
    };

    it.each([
      ['the read rejects', async () => { breakManifestRead(); }],
      ['the stored body is not JSON', async (worker) => { await worker.store(MANIFEST_KEY, new Response('not json')); }],
    ])('when %s, a non-navigation write is stored and a navigation is not', async (_name, damage) => {
      const worker = await install({ '/': pageHash('page') });
      await damage(worker);
      const { background } = await dispatchFetch(worker, asset('/_astro/late.js'));
      await Promise.all(background);
      expect(await worker.holds('https://pdkef.test/_astro/late.js')).toBe(true);
      const { response, background: more } = await dispatchFetch(worker, navigate('/merge/'));
      expect(await response.text()).toBe('page');
      await Promise.all(more);
      expect(await worker.holds('https://pdkef.test/merge/')).toBe(false);
    });

    it('reads the manifest again on a later write after a failed read', async () => {
      const worker = await install({ '/icons/icon-512.png': pageHash('this build') });
      const restore = breakManifestRead();
      const first = await dispatchFetch(worker, asset('/icons/icon-512.png'));
      await Promise.all(first.background);
      expect(await worker.holds('https://pdkef.test/icons/icon-512.png')).toBe(true);
      await worker.drop('https://pdkef.test/icons/icon-512.png');
      restore();
      const second = await dispatchFetch(worker, asset('/icons/icon-512.png'));
      await Promise.all(second.background);
      expect(await worker.holds('https://pdkef.test/icons/icon-512.png')).toBe(false);
    });
  });

  describe('navigation refresh', () => {
    const navigate = (path) => navigation(`https://pdkef.test${path}`);
    const install = async (hashes, serve) => {
      const worker = createWorker(manifestResponder(['/'], serve, {}, hashes), [], source);
      await dispatchInstall(worker);
      return worker;
    };

    it('keeps the cached bytes when the server page is not this build\'s', async () => {
      const worker = await install({ '/sign/': pageHash('build page') }, () => new Response('newer build page'));
      await worker.store('https://pdkef.test/sign/', new Response('build page'));
      const { response, background } = await dispatchFetch(worker, navigate('/sign/'));
      expect(await response.text()).toBe('build page');
      await Promise.all(background);
      expect(await (await worker.stored('https://pdkef.test/sign/')).text()).toBe('build page');
    });

    it('stores an uncached page whose bytes match its manifest entry', async () => {
      const worker = await install({ '/merge/': pageHash('merge page') }, () => new Response('merge page'));
      const { response } = await dispatchFetch(worker, navigate('/merge/'));
      expect(await response.text()).toBe('merge page');
      expect(await (await worker.stored('https://pdkef.test/merge/')).text()).toBe('merge page');
    });

    it('returns but does not store a page the manifest has no entry for', async () => {
      const worker = await install({}, () => new Response('unlisted page'));
      const { response } = await dispatchFetch(worker, navigate('/unlisted/'));
      expect(await response.text()).toBe('unlisted page');
      expect(await worker.holds('https://pdkef.test/unlisted/')).toBe(false);
    });
  });
});

// MEM-28: a page is served from the cache only with its whole closure, and a page that came
// from another build on the network gets the network's stable-named files, not this build's.
describe.each([['source', workerSource], ['minified source', minifiedWorkerSource]])('a page and its files come from one build (%s)', (_label, source) => {
  const navigate = (path) => navigation(`https://pdkef.test${path}`);
  const asset = (path) => new Request(`https://pdkef.test${path}`, { mode: 'no-cors' });
  const CSS = '/shared/PdfMergeTool-0da6a7.css';
  const ENTRY = '/site/PdfMergeTool.js';
  const CHUNK = '/_astro/pdf.Ab12Cd.js';
  const pages = { '/': ['/', CSS], '/merge/': ['/merge/', ENTRY, CHUNK, CSS], '/sign/': ['/sign/'] };
  const THIS = { '/': 'home', '/merge/': 'merge page', '/sign/': 'sign page', [ENTRY]: 'merge entry', [CSS]: 'merge css', [CHUNK]: 'pdf chunk' };
  const hashes = Object.fromEntries(Object.entries(THIS).filter(([url]) => !url.startsWith('/_astro/')).map(([url, bytes]) => [url, pageHash(bytes)]));
  // Installs this build while the network serves `during`, then switches the network to `after`
  // (a map of pathname to body; a missing pathname answers 404, null means offline).
  // MEM-35: `open` lists the pages open in a tab at install, which is what picks the install set.
  const installThen = async (during, after, open = ['/merge/']) => {
    let serving = during;
    const site = (async (request) => {
      const { pathname } = new URL(request.url);
      if (pathname === '/precache-manifest.json') return new Response(JSON.stringify({ version: 2, build: '__BUILD_ID__', shell: ['/'], pages, hashes }));
      if (serving === null) return offline();
      return pathname in serving ? new Response(serving[pathname]) : new Response('missing', { status: 404 });
    });
    const worker = createWorker(site, [], source);
    worker.windows = open.map((path) => ({ id: path, url: `https://pdkef.test${path}` }));
    await dispatchInstall(worker);
    serving = after;
    return worker;
  };
  const withoutCss = Object.fromEntries(Object.entries(THIS).filter(([url]) => url !== CSS));
  const NEXT = { '/': 'next home', '/merge/': 'next merge page', [ENTRY]: 'next merge entry', [CHUNK]: 'next chunk' };

  it('does not serve a cached page whose closure missed a file at install, and serves the network page', async () => {
    const worker = await installThen(withoutCss, NEXT);
    expect(await (await worker.stored('https://pdkef.test/merge/')).text()).toBe('merge page');
    const { response } = await dispatchFetch(worker, navigate('/merge/'), { resultingClientId: 'tab-1' });
    expect(await response.text()).toBe('next merge page');
  });

  // MEM-40 rewrites "offline, treats that page as uncached and serves the root fallback": the home page
  // answers only when it is itself servable, else the browser gets a network error.
  it('offline, with an uncached page and an incomplete /, answers with a network error', async () => {
    const worker = await installThen(withoutCss, null);
    const { response } = await dispatchFetch(worker, navigate('/merge/'));
    expect(response.type).toBe('error');
  });

  it('offline, with an uncached page and a complete /, answers with the home page', async () => {
    const worker = await installThen(THIS, null, ['/', '/merge/']);
    const { response } = await dispatchFetch(worker, navigate('/sign/'));
    expect(await response.text()).toBe('home');
  });

  it('serves a cached page whose own closure is complete while another page\'s is not', async () => {
    const worker = await installThen({ ...THIS, '/sign/': 'sign of another build' }, NEXT, ['/merge/', '/sign/']);
    expect(await worker.holds('https://pdkef.test/__pdkef/precache-complete/')).toBe(false);
    const { response } = await dispatchFetch(worker, navigate('/merge/'));
    expect(await response.text()).toBe('merge page');
  });

  it('serves the page once its missing file is fetched from a network that serves this build', async () => {
    const worker = await installThen(withoutCss, THIS);
    const first = await dispatchFetch(worker, navigate('/merge/'), { resultingClientId: 'tab-1' });
    expect(await first.response.text()).toBe('merge page');
    const css = await dispatchFetch(worker, asset(CSS), { clientId: 'tab-1' });
    expect(await css.response.text()).toBe('merge css');
    await Promise.all(css.background);
    worker.site = offline;
    const { response } = await dispatchFetch(worker, navigate('/merge/'));
    expect(await response.text()).toBe('merge page');
  });

  it('gives a page from another build the network\'s stable-named files, not this build\'s, and stores none of them', async () => {
    const worker = await installThen(withoutCss, NEXT);
    await dispatchFetch(worker, navigate('/merge/'), { resultingClientId: 'tab-1' });
    const entry = await dispatchFetch(worker, asset(ENTRY), { clientId: 'tab-1' });
    expect(await entry.response.text()).toBe('next merge entry');
    await Promise.all(entry.background);
    expect(await (await worker.stored(`https://pdkef.test${ENTRY}`)).text()).toBe('merge entry');
    // A content-hashed file names its bytes, so the cached copy is still the right one.
    const chunk = await dispatchFetch(worker, asset(CHUNK), { clientId: 'tab-1' });
    expect(await chunk.response.text()).toBe('pdf chunk');
    // Any other tab runs this build's cached page and keeps this build's files.
    const other = await dispatchFetch(worker, asset(ENTRY), { clientId: 'tab-2' });
    expect(await other.response.text()).toBe('merge entry');
  });

  it('remembers that page across a worker restart', async () => {
    const worker = await installThen(withoutCss, NEXT);
    const nav = await dispatchFetch(worker, navigate('/merge/'), { resultingClientId: 'tab-1' });
    await Promise.all(nav.background);
    // The same storage, as after the browser stops and restarts the worker.
    const restarted = createWorker(worker.site, [], source);
    const { response } = await dispatchFetch(restarted, asset(ENTRY), { clientId: 'tab-1' });
    expect(await response.text()).toBe('next merge entry');
  });

  it('does not take a redirect for a page from another build', async () => {
    const worker = await installThen(withoutCss, NEXT);
    const redirect = { type: 'opaqueredirect', ok: false, status: 0 };
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: Node's fetch answers a manual redirect with the 3xx itself, where a browser answers an opaque redirect.
    vi.spyOn(worker.context, 'fetch').mockImplementation(async () => redirect);
    const nav = await dispatchFetch(worker, navigate('/merge'), { resultingClientId: 'tab-1' });
    expect(nav.response).toBe(redirect);
    const { response } = await dispatchFetch(worker, asset(ENTRY), { clientId: 'tab-1' });
    expect(await response.text()).toBe('merge entry');
  });

  it('gives a worker started by a page from another build the network\'s files too', async () => {
    const worker = await installThen(withoutCss, NEXT);
    await dispatchFetch(worker, navigate('/merge/'), { resultingClientId: 'tab-1' });
    await dispatchFetch(worker, asset(CHUNK), { clientId: 'tab-1', resultingClientId: 'worker-1' });
    const { response } = await dispatchFetch(worker, asset(ENTRY), { clientId: 'worker-1' });
    expect(await response.text()).toBe('next merge entry');
  });

  it('treats a closure that is not a list as incomplete rather than failing the navigation', async () => {
    const worker = await installThen(withoutCss, NEXT);
    const key = 'https://pdkef.test/__pdkef/manifest/';
    const manifest = await (await worker.stored(key)).json();
    await worker.store(key, new Response(JSON.stringify({ ...manifest, pages: { '/merge/': 'not a list' } })));
    const restarted = createWorker(worker.site, [], source);
    const { response } = await dispatchFetch(restarted, navigate('/merge/'));
    expect(await response.text()).toBe('next merge page');
  });

  it('gives an uncached page of this build from the network this build\'s cached files', async () => {
    const worker = await installThen({ ...THIS, '/merge/': 'merge of another build' }, THIS);
    const nav = await dispatchFetch(worker, navigate('/merge/'), { resultingClientId: 'tab-1' });
    expect(await nav.response.text()).toBe('merge page');
    worker.site = (async () => new Response('next merge entry'));
    const { response } = await dispatchFetch(worker, asset(ENTRY), { clientId: 'tab-1' });
    expect(await response.text()).toBe('merge entry');
  });
});

// MEM-24: the worker records why an install, or a retried precache, failed. It sends nothing.
describe.each([['source', workerSource], ['minified source', minifiedWorkerSource]])('install failure record (%s)', (_label, source) => {
  const MAINT = 'maint-sw-v1';
  const KEY = 'https://pdkef.test/__maint/sw-install/__BUILD_ID__';
  const hasMaintCache = async () => (await cacheStorage.keys()).includes(MAINT);
  const recordOf = async () => {
    if (!await hasMaintCache()) return undefined;
    const stored = await (await cacheStorage.open(MAINT)).match(KEY);
    return stored ? JSON.parse(await stored.text()) : undefined;
  };
  const refuseWrites = (refused = (url) => !url.includes('/__maint/'), message = 'QuotaExceededError') => {
    const real = CachePrototype.put;
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a disk that refuses a write is not something Node's storage does on demand.
    return vi.spyOn(CachePrototype, 'put').mockImplementation(async function put(request, response) {
      if (refused(typeof request === 'string' ? request : request.url)) throw new Error(message);
      return real.call(this, request, response);
    });
  };
  const manifestOf = (extra = {}) => ({ version: 2, build: '__BUILD_ID__', shell: ['/', '/sign/'], pages: {}, hashes: {}, ...extra });
  const serving = (manifestResponse, perUrl = () => new Response('asset')) => (async (request) => {
    const url = request.url;
    if (url.endsWith('/precache-manifest.json')) return typeof manifestResponse === 'function' ? manifestResponse() : manifestResponse.clone();
    return perUrl(new URL(url).pathname);
  });
  const build = (site) => createWorker(site, ['pdkef-previous'], source);
  const flush = () => new Promise((resolveFlush) => setTimeout(resolveFlush, 0));

  it('records other_build for a manifest from another build', async () => {
    const worker = build(serving(new Response(JSON.stringify(manifestOf({ build: 'another' })))));
    await expect(dispatchInstall(worker)).rejects.toThrow('Precache manifest belongs to another build.');
    expect(await recordOf()).toEqual({ v: 1, build: '__BUILD_ID__', reason: 'other_build', missed: '0' });
  });

  it.each([
    ['a status other than 404', () => new Response('no', { status: 500 })],
    ['an invalid shape', () => new Response(JSON.stringify({ version: 1 }))],
    ['a body that is not JSON', () => new Response('<html>')],
    ['a network failure', offline],
  ])('records manifest_unreadable for %s', async (_name, manifest) => {
    const worker = build(serving(manifest));
    await expect(dispatchInstall(worker)).rejects.toThrow();
    expect(await recordOf()).toMatchObject({ reason: 'manifest_unreadable', missed: '0' });
  });

  it('records storage when the build cache refuses a write', async () => {
    const worker = build(serving(new Response(JSON.stringify(manifestOf()))));
    refuseWrites();
    await expect(dispatchInstall(worker)).rejects.toThrow('QuotaExceededError');
    expect(await recordOf()).toMatchObject({ reason: 'storage', missed: '0' });
  });

  it('still rejects with the original error, after the bound, when the record write never settles', async () => {
    const worker = build(serving(new Response(JSON.stringify(manifestOf({ build: 'another' })))));
    const real = CachePrototype.put;
    let started;
    const putStarted = new Promise((resolveStarted) => { started = resolveStarted; });
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: storage that never answers a write cannot be made on demand.
    vi.spyOn(CachePrototype, 'put').mockImplementation(function put(request, response) {
      if (!(typeof request === 'string' ? request : request.url).includes('/__maint/')) return real.call(this, request, response);
      started();
      return new Promise(() => {});
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const settled = dispatchInstall(worker).then(() => 'resolved', (error) => error.message);
      await orGiveUp(putStarted);
      await vi.advanceTimersByTimeAsync(2500);
      expect(await settled).toBe('Precache manifest belongs to another build.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('records storage when the last step, marking the precache complete, cannot write', async () => {
    const worker = build(serving(new Response(JSON.stringify(manifestOf()))));
    refuseWrites((url) => url.endsWith('/__pdkef/precache-complete/'));
    await expect(dispatchInstall(worker)).rejects.toThrow('QuotaExceededError');
    expect(await recordOf()).toEqual({ v: 1, build: '__BUILD_ID__', reason: 'storage', missed: '0' });
  });

  it.each([
    ['a non-ok answer', () => new Response('no', { status: 500 })],
    ['a network failure', offline],
  ])('records root_unreachable for / with %s', async (_name, root) => {
    const worker = build(serving(new Response(JSON.stringify(manifestOf())), (pathname) => (pathname === '/' ? root() : new Response('asset'))));
    await expect(dispatchInstall(worker)).rejects.toThrow();
    expect(await recordOf()).toMatchObject({ reason: 'root_unreachable', missed: '0' });
  });

  it('records root_mismatch when / is not this build\'s file', async () => {
    const hashes = { '/': pageHash('this build') };
    const worker = build(serving(new Response(JSON.stringify(manifestOf({ hashes }))), () => new Response('rewritten by a proxy')));
    await expect(dispatchInstall(worker)).rejects.toThrow(/is not this build's file/);
    expect(await recordOf()).toMatchObject({ reason: 'root_mismatch', missed: '0' });
  });

  it('writes no record for a successful install', async () => {
    const worker = build(serving(new Response(JSON.stringify(manifestOf()))));
    await dispatchInstall(worker);
    await flush();
    expect(await hasMaintCache()).toBe(false);
  });

  it('writes no record for an install that only missed some files', async () => {
    const worker = build(serving(new Response(JSON.stringify(manifestOf())), (pathname) => (pathname === '/sign/' ? new Response('no', { status: 503 }) : new Response('asset'))));
    await dispatchInstall(worker);
    await flush();
    expect(await hasMaintCache()).toBe(false);
  });

  it('writes no record for an orphaned worker, which still removes itself', async () => {
    const worker = build(() => new Response('not found', { status: 404 }));
    await dispatchInstall(worker);
    await flush();
    expect(worker.self.registration.unregister).toHaveBeenCalledOnce();
    expect(await hasMaintCache()).toBe(false);
  });

  it('keeps failing the same way when the record cannot be written', async () => {
    const worker = build(serving(new Response(JSON.stringify(manifestOf({ build: 'another' })))));
    refuseWrites((url) => url.includes('/__maint/'), 'no room');
    await expect(dispatchInstall(worker)).rejects.toThrow('Precache manifest belongs to another build.');
  });

  it('keeps failing the same way when the record cache cannot be opened', async () => {
    const worker = build(serving(new Response(JSON.stringify(manifestOf({ build: 'another' })))));
    const real = cacheStorage.open;
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a cache that cannot be opened is a storage fault Node does not produce on demand.
    vi.spyOn(cacheStorage, 'open').mockImplementation(async function open(key) {
      if (key === MAINT) throw new Error('storage is gone');
      return real.call(this, key);
    });
    await expect(dispatchInstall(worker)).rejects.toThrow('Precache manifest belongs to another build.');
  });

  describe('files_missed from the retried precache', () => {
    const retry = async (failing) => {
      const { worker } = await buildIncompleteWorker(source, [], failing);
      await dispatchMessage(worker, { type: 'pdkef:skip-waiting' });
      await flush();
      return worker;
    };

    it('records the bucket of what the retry still missed', async () => {
      const site = (async (request) => {
        const url = request.url;
        if (url.endsWith('/precache-manifest.json')) return new Response(JSON.stringify(manifestOf({ pages: { '/': ['/', '/a.js', '/b.js', '/c.js'] } })));
        return new Response('no', { status: 503 });
      });
      const worker = build(site);
      await worker.store('https://pdkef.test/', new Response('home'));
      worker.windows = [];
      await dispatchMessage(worker, { type: 'pdkef:skip-waiting' });
      await flush();
      expect(await recordOf()).toEqual({ v: 1, build: '__BUILD_ID__', reason: 'files_missed', missed: '2-5' });
    });

    it('leaves no record once a later retry completes', async () => {
      const failing = ['/_astro/app.js'];
      const { worker } = await buildIncompleteWorker(source, [], failing);
      await dispatchMessage(worker, { type: 'pdkef:skip-waiting' });
      await flush();
      expect(await recordOf()).toMatchObject({ reason: 'files_missed', missed: '1' });
      failing.length = 0;
      await dispatchMessage(worker, { type: 'pdkef:skip-waiting' });
      await flush();
      expect(await worker.holds(PRECACHE_MARKER)).toBe(true);
      expect(await recordOf()).toBeUndefined();
    });

    it('has the files_missed record written before the retry settles', async () => {
      const { worker } = await buildIncompleteWorker(source, [], ['/_astro/app.js']);
      const real = cacheStorage.open;
      let reached;
      const reaching = new Promise((resolveReached) => { reached = resolveReached; });
      let release;
      const slow = new Promise((resolveSlow) => { release = resolveSlow; });
      // oxlint-disable-next-line landmines/no-test-doubles -- Forced: storage that is slow to open the record cache cannot be made on demand.
      vi.spyOn(cacheStorage, 'open').mockImplementation(async function open(key) {
        if (key === MAINT) {
          reached();
          await slow;
        }
        return real.call(this, key);
      });
      let settled = false;
      const retried = dispatchMessage(worker, { type: 'pdkef:skip-waiting' }).then(() => { settled = true; });
      await orGiveUp(reaching);
      await drainPromises();
      expect(settled).toBe(false);
      release();
      await retried;
      expect(await recordOf()).toMatchObject({ reason: 'files_missed' });
    });

    it('writes nothing when the retry completes', async () => {
      const worker = await retry([]);
      expect(await worker.holds(PRECACHE_MARKER)).toBe(true);
      expect(await hasMaintCache()).toBe(false);
    });
  });

  describe('cleanup leaves the record alone', () => {
    it('activate never deletes it', async () => {
      const worker = createWorker(undefined, ['pdkef-previous', MAINT], source);
      await dispatchActivate(worker);
      expect(worker.caches.delete).toHaveBeenCalledWith('pdkef-previous');
      expect(worker.caches.delete).not.toHaveBeenCalledWith(MAINT);
    });

    it('removeSelf never deletes it', async () => {
      const worker = createWorker(() => new Response('not found', { status: 404 }), ['pdkef-previous', MAINT], source);
      await dispatchInstall(worker);
      expect(worker.caches.delete).toHaveBeenCalledWith('pdkef-previous');
      expect(worker.caches.delete).not.toHaveBeenCalledWith(MAINT);
    });
  });

  it.each([[0, '0'], [1, '1'], [2, '2-5'], [5, '2-5'], [6, '6-20'], [20, '6-20'], [21, '21+']])('buckets %i missed files as %s', (count, bucket) => {
    expect(createWorker(undefined, [], source).context.missedBucket(count)).toBe(bucket);
  });
});

// MEM-29: a phone kept a day-old worker because every install of the fix failed on `/`'s hash. A
// mismatch is retried once past the HTTP cache, and a critical build whose install still fails
// unregisters the older build, so the next load comes from the network instead of that stale cache.
describe.each([['source', workerSource], ['minified source', minifiedWorkerSource]])('a failed install of a critical build (%s)', (_label, source) => {
  const OLDER = `pdkef-c${SHIPPED_CRITICAL - 1}-older`;
  const manifest = { version: 2, build: '__BUILD_ID__', shell: ['/', '/sign/'], pages: {}, hashes: { '/': pageHash('home') } };
  const serving = (root) => (async (request, cache) => {
    if (request.url.endsWith('/precache-manifest.json')) return new Response(JSON.stringify(manifest));
    return new URL(request.url).pathname === '/' ? root(request, cache) : new Response('asset');
  });
  const build = (site, keys = [OLDER]) => createWorker(site, keys, source);

  it('retries a file whose bytes miss its hash once, past the HTTP cache, and keeps the retry when it matches', async () => {
    const worker = build(serving((request, cache) => new Response(cache === 'reload' ? 'home' : 'stale home')));
    await dispatchInstall(worker);
    expect(await (await worker.stored('https://pdkef.test/')).text()).toBe('home');
    expect(worker.requests.filter((request) => new URL(request.url).pathname === '/').map((request) => request.cache)).toEqual(['no-cache', 'reload']);
    expect(worker.self.registration.unregister).not.toHaveBeenCalled();
  });

  it('unregisters the older build when / still misses its hash, and leaves that build\'s cache to its open pages', async () => {
    const worker = build(serving(() => new Response('stale home')));
    await worker.store('https://pdkef.test/sign/', new Response('older sign'), OLDER);
    await expect(dispatchInstall(worker)).rejects.toThrow(/is not this build's file/);
    expect(worker.self.registration.unregister).toHaveBeenCalledOnce();
    expect(await (await worker.stored('https://pdkef.test/sign/', OLDER)).text()).toBe('older sign');
  });

  it('fails the install without waiting on the unregister, whose job queues behind this install', async () => {
    const worker = build(serving(() => new Response('stale home')));
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a real registration queues its unregister behind the running install, so it cannot settle inside it.
    vi.spyOn(worker.self.registration, 'unregister').mockImplementation(() => new Promise(() => {}));
    const settled = await Promise.race([
      dispatchInstall(worker).then(() => 'resolved', () => 'rejected'),
      new Promise((resolveLate) => setTimeout(() => resolveLate('still installing'), 1000)),
    ]);
    expect(settled).toBe('rejected');
    expect(worker.self.registration.unregister).toHaveBeenCalledOnce();
  });

  it('keeps the older build when / is unreachable, so the app still opens offline', async () => {
    const worker = build(serving(offline));
    await expect(dispatchInstall(worker)).rejects.toThrow();
    expect(worker.self.registration.unregister).not.toHaveBeenCalled();
  });

  it('keeps the registration on a first install, with no older build to release', async () => {
    const worker = build(serving(() => new Response('stale home')), []);
    await expect(dispatchInstall(worker)).rejects.toThrow(/is not this build's file/);
    expect(worker.self.registration.unregister).not.toHaveBeenCalled();
  });

  it.each([
    ['a retry that fails', (_request, cache) => (cache === 'reload' ? new Response('no', { status: 503 }) : new Response('stale home'))],
    ['a retry that throws', (_request, cache) => (cache === 'reload' ? offline() : new Response('stale home'))],
  ])('keeps the older build for %s, which reads as unreachable', async (_name, root) => {
    const worker = build(serving(root));
    await expect(dispatchInstall(worker)).rejects.toThrow();
    expect(worker.self.registration.unregister).not.toHaveBeenCalled();
  });

  it('keeps the older build for a manifest of another build, which the next deploy\'s worker clears', async () => {
    const worker = build(() => new Response(JSON.stringify({ ...manifest, build: 'another' })));
    await expect(dispatchInstall(worker)).rejects.toThrow('Precache manifest belongs to another build.');
    expect(worker.self.registration.unregister).not.toHaveBeenCalled();
  });

  it('keeps the older build when storage is full, where releasing it frees nothing', async () => {
    const worker = build(serving(() => new Response('home')));
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a full disk is not something Node's storage does on demand.
    vi.spyOn(CachePrototype, 'put').mockRejectedValue(new Error('QuotaExceededError'));
    await expect(dispatchInstall(worker)).rejects.toThrow('QuotaExceededError');
    expect(worker.self.registration.unregister).not.toHaveBeenCalled();
  });

  it('keeps a build of the same critical version', async () => {
    const worker = build(serving(() => new Response('stale home')), [`pdkef-c${SHIPPED_CRITICAL}-same`]);
    await expect(dispatchInstall(worker)).rejects.toThrow(/is not this build's file/);
    expect(worker.self.registration.unregister).not.toHaveBeenCalled();
  });
});

// MEM-34: install reused nothing the page had just loaded (every unhashed file asked the CDN again),
// and every cached navigation refetched a page that already was this build's.
describe('MEM-34: install reuses the HTTP cache, and a same-build page is not refetched', () => {
  const hashes = { '/': pageHash('home'), '/shared/a.js': pageHash('fresh a') };
  const modesFor = (worker, pathname) => worker.requests
    .filter((request) => new URL(request.url).pathname === pathname)
    .map((request) => request.cache);
  const installing = (shared, urls = ['/', '/shared/a.js'], manifestHashes = hashes) => {
    const base = manifestResponder(urls, (pathname) => new Response(pathname === '/' ? 'home' : 'fresh a'), {}, manifestHashes);
    const site = (async (request, cache) => {
      if (cache === 'force-cache' && new URL(request.url).pathname === '/shared/a.js') return shared(request);
      return base(request);
    });
    return createWorker(site, []);
  };

  it('stores a file whose force-cache answer matches the hash, with no no-cache request for it', async () => {
    const worker = installing(() => new Response('fresh a'));
    await dispatchInstall(worker);
    expect(await (await worker.stored('https://pdkef.test/shared/a.js')).text()).toBe('fresh a');
    expect(modesFor(worker, '/shared/a.js')).toEqual(['force-cache']);
  });

  it('falls through to no-cache and stores the fresh bytes when the force-cache answer is stale', async () => {
    const worker = installing(() => new Response('stale a'));
    await dispatchInstall(worker);
    expect(await (await worker.stored('https://pdkef.test/shared/a.js')).text()).toBe('fresh a');
    expect(modesFor(worker, '/shared/a.js')).toEqual(['force-cache', 'no-cache']);
  });

  it.each([
    ['a network error', offline],
    ['a non-ok status', () => new Response('nope', { status: 504 })],
  ])('falls through to no-cache after %s from force-cache', async (_name, shared) => {
    const worker = installing(shared);
    await dispatchInstall(worker);
    expect(await (await worker.stored('https://pdkef.test/shared/a.js')).text()).toBe('fresh a');
    expect(modesFor(worker, '/shared/a.js')).toEqual(['force-cache', 'no-cache']);
  });

  it('makes no force-cache request for a page, whose headers carry the CSP (review of MEM-34)', async () => {
    const worker = installing(() => new Response('fresh a'), ['/', '/shared/a.js'], { '/': pageHash('home'), '/shared/a.js': pageHash('fresh a') });
    await dispatchInstall(worker);
    expect(modesFor(worker, '/')).toEqual(['no-cache']);
    expect(modesFor(worker, '/shared/a.js')).toEqual(['force-cache']);
  });

  it('makes no force-cache request for a URL the manifest lists no hash for', async () => {
    const worker = installing(() => new Response('fresh a'), ['/', '/shared/a.js'], { '/': pageHash('home') });
    await dispatchInstall(worker);
    expect(modesFor(worker, '/shared/a.js')).toEqual(['no-cache']);
  });

  const navigate = navigation('https://pdkef.test/sign/');
  const installed = async (signHashes) => {
    const worker = createWorker(manifestResponder(['/'], (pathname) => new Response(pathname === '/' ? 'home' : 'fresh sign page'), {}, { '/': pageHash('home'), ...signHashes }), []);
    await dispatchInstall(worker);
    await worker.store('https://pdkef.test/sign/', new Response('cached sign page'));
    worker.requests.length = 0;
    return worker;
  };

  it('serves a cached page that matches the manifest hash with no network request for it', async () => {
    const worker = await installed({ '/sign/': pageHash('cached sign page') });
    const { response, background } = await dispatchFetch(worker, navigate);
    await Promise.all(background);
    expect(await response.text()).toBe('cached sign page');
    expect(worker.fetchedPaths()).not.toContain('/sign/');
  });

  it('still refreshes a cached page the manifest lists no hash for', async () => {
    const worker = await installed({});
    const { response, background } = await dispatchFetch(worker, navigate);
    await Promise.all(background);
    expect(await response.text()).toBe('cached sign page');
    expect(worker.fetchedPaths()).toContain('/sign/');
  });
});

// MEM-45: the worker counts the requests that reached the server, by what asked for them.
describe.each([['source', workerSource], ['minified source', minifiedWorkerSource]])('download tally (%s)', (_label, source) => {
  const MAINT = 'maint-sw-v1';
  const TAKE = { type: 'pdkef:take-downloads' };
  // A mock resource timeline: every request that reaches the server lands in `pending`, as `size` bytes
  // over the wire, until the worker takes the records or the test emits them.
  function timeline(size = 100) {
    // `null` leaves the transfer size off the entry.
    const po = { pending: [], callback: null };
    // Forced: each test sets the sizes the browser reports, 0 from its cache or none at all; Node's fetch counts at least 300.
    class FakeObserver {
      static supportedEntryTypes = ['resource'];
      constructor(callback) { po.callback = callback; }
      observe(options) { po.options = options; }
      takeRecords() { return po.pending.splice(0); }
    }
    po.Observer = FakeObserver;
    po.emit = (...entries) => po.callback({ getEntries: () => entries });
    po.wrap = (inner) => (async (request, cache) => {
      const entry = { name: request.url };
      if (size !== null) entry.transferSize = size;
      po.pending.push(entry);
      return inner(request, cache);
    });
    return po;
  }
  const make = (po, inner, keys) => createWorker(po.wrap(inner), keys, source, SHIPPED_CRITICAL, { PerformanceObserver: po.Observer });
  const home = (urls = ['/', '/a.js'], pages = {}, hashes = {}) => manifestResponder(urls, (pathname) => new Response(pathname === '/' ? 'home' : 'asset'), pages, hashes);
  const maintEntries = async () => ((await cacheStorage.keys()).includes(MAINT) ? everything(MAINT) : new Map());
  const recordsOf = async () => Promise.all([...await maintEntries()].filter(([key]) => key.includes('/__maint/downloads/')).map(async ([, value]) => JSON.parse(await value.text())));
  // One open tab, which the worker hints when it has written a record.
  const hint = (worker) => {
    let hinted;
    const window = {
      sent: [],
      hinted: new Promise((resolveHinted) => { hinted = resolveHinted; }),
      // oxlint-disable-next-line landmines/no-test-doubles -- Forced: Node has no window client, so the tab and its scripted answer are mocks.
      postMessage: vi.fn((message) => { window.sent.push(message); hinted(); }),
    };
    worker.windows = [window];
    return window;
  };
  const navigate = navigation('https://pdkef.test/sign/');

  it('observes resource entries with the buffered ones', async () => {
    const po = timeline();
    make(po, home(), []);
    expect(po.options).toEqual({ type: 'resource', buffered: true });
  });

  it('counts a first install as install, and the manifest it asked for as forwarded', async () => {
    const po = timeline();
    const worker = make(po, home(), []);
    await dispatchInstall(worker);
    expect(await dispatchMessage(worker, TAKE)).toEqual({ install: 2, forwarded: 1 });
  });

  it('counts both fetches of one file under the pass reason', async () => {
    const po = timeline();
    const base = home(['/', '/a.js'], {}, { '/a.js': pageHash('asset') });
    const worker = make(po, (request, cache) => (cache === 'force-cache' ? new Response('stale') : base(request, cache)), []);
    await dispatchInstall(worker);
    expect(await dispatchMessage(worker, TAKE)).toEqual({ install: 3, forwarded: 1 });
  });

  it('counts an install over a previous build as update', async () => {
    const po = timeline();
    const worker = make(po, home(), ['pdkef-previous']);
    await dispatchInstall(worker);
    expect(await dispatchMessage(worker, TAKE)).toEqual({ update: 2, forwarded: 1 });
  });

  it('counts the closure of a page the network answered as addtool', async () => {
    const po = timeline();
    const worker = make(po, home(['/'], { '/sign/': ['/sign/', '/sign.js'] }, { '/': pageHash('home'), '/sign/': pageHash('sign page') }), []);
    await dispatchInstall(worker);
    await dispatchMessage(worker, TAKE);
    worker.site = po.wrap((request) => new Response(request.url.endsWith('/sign/') ? 'sign page' : 'asset'));
    const { response, background } = await dispatchFetch(worker, navigate);
    await response.text();
    await awaitAll(background);
    expect(await dispatchMessage(worker, TAKE)).toEqual({ addtool: 1, forwarded: 1 });
  });

  it('counts the background refresh of a page answered from cache as refresh', async () => {
    const po = timeline();
    const worker = make(po, home(['/']), []);
    await dispatchInstall(worker);
    await dispatchMessage(worker, TAKE);
    await worker.store('https://pdkef.test/sign/', new Response('cached sign page'));
    const { background } = await dispatchFetch(worker, navigate);
    await awaitAll(background);
    expect(await dispatchMessage(worker, TAKE)).toEqual({ refresh: 1 });
  });

  it('counts the pages open after the first activation as install', async () => {
    const po = timeline();
    const worker = make(po, home(['/'], { '/': ['/', '/home.js'] }), []);
    await dispatchInstall(worker);
    await dispatchMessage(worker, TAKE);
    await worker.drop('https://pdkef.test/home.js');
    await dispatchActivate(worker);
    await untilHeld(worker, '/home.js');
    expect(await dispatchMessage(worker, TAKE)).toEqual({ install: 1 });
  });

  it('counts a request the worker passes through as forwarded', async () => {
    const po = timeline();
    const worker = make(po, home(['/']), []);
    await dispatchInstall(worker);
    await dispatchMessage(worker, TAKE);
    const { response } = await dispatchFetch(worker, new Request('https://pdkef.test/other.js'));
    await response.text();
    expect(await dispatchMessage(worker, TAKE)).toEqual({ forwarded: 1 });
  });

  it('counts nothing for an entry served from the HTTP cache, and writes no record', async () => {
    const po = timeline(0);
    const worker = make(po, home(), []);
    await dispatchInstall(worker);
    expect(await recordsOf()).toEqual([]);
    expect(await dispatchMessage(worker, TAKE)).toEqual({});
  });

  it('marks the tally unmeasured for an entry without a transfer size', async () => {
    const po = timeline(null);
    const worker = make(po, home(), []);
    await dispatchInstall(worker);
    expect(await dispatchMessage(worker, TAKE)).toEqual({ unmeasured: true });
  });

  it('is unmeasured from the start without a resource observer, never reading as zero downloads', async () => {
    const worker = createWorker(home(), [], source, SHIPPED_CRITICAL, { PerformanceObserver: undefined });
    await dispatchInstall(worker);
    expect(await dispatchMessage(worker, TAKE)).toEqual({ unmeasured: true });
  });

  it('writes one record per flush and posts the hint to every window', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const po = timeline();
      const worker = make(po, home(['/']), []);
      const tab = hint(worker);
      po.emit({ name: 'https://pdkef.test/x.js', transferSize: 5 }, { name: 'https://pdkef.test/y.js', transferSize: 5 });
      await vi.advanceTimersByTimeAsync(1999);
      expect(await recordsOf()).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      await orGiveUp(tab.hinted);
      expect(await recordsOf()).toEqual([{ v: 1, forwarded: 2 }]);
      expect(tab.sent).toEqual([{ type: 'pdkef:downloads-recorded' }]);
      const [key] = (await maintEntries()).keys();
      expect(key).toMatch(/^https:\/\/pdkef\.test\/__maint\/downloads\/__BUILD_ID__-\d+-/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sums and deletes every record on a take, and a second take gets nothing', async () => {
    const po = timeline();
    const worker = make(po, home(['/']), []);
    const maint = await worker.caches.open(MAINT);
    await maint.put('https://pdkef.test/__maint/downloads/a', new Response(JSON.stringify({ v: 1, install: 2, forwarded: 1 })));
    await maint.put('https://pdkef.test/__maint/downloads/b', new Response(JSON.stringify({ v: 1, install: 1, refresh: 4, unmeasured: true })));
    await maint.put('https://pdkef.test/__maint/sw-install/other', new Response('{}'));
    po.emit({ name: 'https://pdkef.test/x.js', transferSize: 5 });
    expect(await dispatchMessage(worker, TAKE)).toEqual({ install: 3, forwarded: 2, refresh: 4, unmeasured: true });
    expect([...(await maintEntries()).keys()]).toEqual(['https://pdkef.test/__maint/sw-install/other']);
    expect(await dispatchMessage(worker, TAKE)).toEqual({});
  });

  it('gives two takes at once the records only once', async () => {
    const po = timeline();
    const worker = make(po, home(['/']), []);
    po.emit({ name: 'https://pdkef.test/x.js', transferSize: 5 });
    const [first, second] = await Promise.all([dispatchMessage(worker, TAKE), dispatchMessage(worker, TAKE)]);
    expect([first, second]).toEqual([{ forwarded: 1 }, {}]);
  });

  it('drops the counts when 50 records are already held', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const po = timeline();
      const worker = make(po, home(['/']), []);
      const maint = await worker.caches.open(MAINT);
      for (let n = 0; n < 50; n += 1) await maint.put(`https://pdkef.test/__maint/downloads/old-${n}`, new Response('{"v":1,"install":1}'));
      const tab = hint(worker);
      po.emit({ name: 'https://pdkef.test/x.js', transferSize: 5 });
      await vi.advanceTimersByTimeAsync(2000);
      // The timer's flush is first in the worker's chain, so this one settles after it.
      await worker.context.flushDownloads();
      expect(await recordsOf()).toHaveLength(50);
      expect(tab.sent).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
