// Hand-written, dependency-free service worker. Bump CACHE_VERSION on any
// deploy where you want clients to drop their old cache.
//
// Strategy:
//   - The complete built application shell is precached during install.
//   - HTML navigations are cache-first and refresh in the background, so a
//     returning visitor can reopen the app when the server is unavailable.
//   - Other same-origin assets are cache-first after precache or first use.
//   - Cross-origin requests are never intercepted — this app makes none
//     in normal operation; not touching them is a deliberate safeguard.
const CACHE_VERSION = 'pdkef-__BUILD_ID__';

const PRECACHE_MANIFEST_URL = '/precache-manifest.json';

// A real ServiceWorkerGlobalScope resolves a bare '/path' Request against the
// worker's own script URL implicitly, same as any Window/Worker context - but
// nothing here should depend on an ambient base that only exists in a browser.
// self.location is already load-bearing elsewhere in this file (the fetch
// handler's origin check below), so resolving explicitly against it costs
// nothing and makes every fetch in this file behave identically under a real
// browser and under a Node-based test harness with no implicit base URL.
function resolve(path) {
  return new URL(path, self.location.origin).href;
}

async function precacheAppShell() {
  const manifestResponse = await fetch(new Request(resolve(PRECACHE_MANIFEST_URL), { cache: 'reload' }));
  if (!manifestResponse.ok) {
    throw new Error(`Failed to load precache manifest: ${manifestResponse.status}`);
  }
  const { urls } = await manifestResponse.json();
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('Precache manifest has no URLs.');
  }

  const cache = await caches.open(CACHE_VERSION);
  await Promise.all(urls.map(async (url) => {
    const response = await fetch(new Request(resolve(url), { cache: 'reload' }));
    if (!response.ok) {
      throw new Error(`Failed to precache ${url}: ${response.status}`);
    }
    await cache.put(url, response);
  }));
}

function navigationCacheKey(request) {
  return new URL(request.url).pathname;
}

async function refreshNavigation(request, cache, cacheKey) {
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(cacheKey, response.clone());
    return response;
  } catch {
    return null;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheAppShell().then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 1. Navigation requests: use the cached route immediately and refresh it
  // in the background. Query strings intentionally share their page shell -
  // /sign/?action=open receives cached /sign/ while location.search remains
  // available to the hydrated client code.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cacheKey = navigationCacheKey(request);
        const cached = await cache.match(cacheKey);
        if (cached) {
          event.waitUntil(refreshNavigation(request, cache, cacheKey));
          return cached;
        }
        const response = await refreshNavigation(request, cache, cacheKey);
        return response ?? cache.match('/');
      }),
    );
    return;
  }

  // 2. Every other same-origin asset is cache-first. The build manifest has
  // already populated the essential app shell; this caches any later asset on
  // first use without making it a condition of a navigation response.
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) => cache.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          cache.put(request, copy);
        }
        return response;
      });
    })),
  );
});
