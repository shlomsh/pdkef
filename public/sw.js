// Hand-written, dependency-free service worker. CACHE_VERSION is content-hashed
// per build by scripts/generate-precache-manifest.mjs, so every deploy gets its
// own cache and no two builds ever share one.
//
// Strategy:
//   - Only the root offline fallback is precached during install. Every tool,
//     documentation page, script, image, and font loads and caches on demand.
//   - HTML navigations are cache-first and refresh in the background, so a
//     returning visitor can reopen the app when the server is unavailable.
//   - Other same-origin assets are cache-first after precache or first use.
//   - Cross-origin requests are never intercepted — this app makes none
//     in normal operation; not touching them is a deliberate safeguard.
//   - An update never takes over a page from the previous build (no
//     skipWaiting), because deleting that build's cache under a live page
//     breaks its lazy imports. See the activate handler.
const CACHE_PREFIX = 'pdkef-';
const CACHE_VERSION = `${CACHE_PREFIX}__BUILD_ID__`;

const PRECACHE_MANIFEST_URL = '/precache-manifest.json';

// The offline fallback that every uncached navigation lands on, and so the one
// precache entry with no second chance at runtime.
const REQUIRED_URL = '/';

// Kept as a bounded worker even though the minimal manifest currently contains
// one URL, so a future shared shell asset cannot create a request burst.
const PRECACHE_CONCURRENCY = 6;

// Raised when this origin serves no build manifest at all — a 404, not a
// network blip. The worker is then running somewhere it was never built for
// (a dev server on a port that once ran `npm run preview`, or a deploy that
// lost its manifest) and cannot verify anything it would serve from cache.
class OrphanedWorkerError extends Error {}

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

// Only ever delete caches this app created. On localhost an origin is just a
// port, so a dev server can share one with anything else that has run there.
function isOwnCache(key) {
  return key.startsWith(CACHE_PREFIX);
}

function fetchFresh(url) {
  return fetch(new Request(resolve(url), { cache: 'reload' }));
}

async function loadPrecacheManifest() {
  const response = await fetchFresh(PRECACHE_MANIFEST_URL);
  if (response.status === 404) {
    throw new OrphanedWorkerError('This origin serves no precache manifest.');
  }
  if (!response.ok) {
    throw new Error(`Failed to load precache manifest: ${response.status}`);
  }
  const { urls } = await response.json();
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('Precache manifest has no URLs.');
  }
  return urls;
}

// Run task over items with at most `limit` in flight. A rejection propagates and
// abandons the remaining work, same as Promise.all.
async function forEachLimited(items, limit, task) {
  let cursor = 0;
  const lanes = Array.from({ length: items.length < limit ? items.length : limit }, async () => {
    while (cursor < items.length) {
      await task(items[cursor++]);
    }
  });
  await Promise.all(lanes);
}

async function precacheAppShell() {
  const urls = await loadPrecacheManifest();
  const cache = await caches.open(CACHE_VERSION);

  // Per-URL tolerance is retained for future shared shell assets. The root
  // fallback is mandatory; anything else loads and caches on demand.
  const missed = [];
  await forEachLimited(urls, PRECACHE_CONCURRENCY, async (url) => {
    try {
      const response = await fetchFresh(url);
      if (!response.ok) throw new Error(`Failed to precache ${url}: ${response.status}`);
      await cache.put(url, response);
    } catch (error) {
      if (url === REQUIRED_URL) throw error;
      missed.push(url);
    }
  });

  if (missed.length > 0) {
    console.warn(`[pdkef] ${missed.length}/${urls.length} assets are not cached for offline use; they will load from the network.`);
  }
}

async function removeSelf() {
  const keys = await caches.keys();
  await Promise.all(keys.filter(isOwnCache).map((key) => caches.delete(key)));
  if (self.registration) await self.registration.unregister();
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
  // Deliberately no skipWaiting(): a new build must not take control of a page
  // that is still running the previous one. See the activate handler.
  event.waitUntil(
    precacheAppShell().catch(async (error) => {
      if (error instanceof OrphanedWorkerError) {
        // Uninstall rather than stay resident. A worker left over from a
        // `npm run preview` kept serving that build's assets cache-first to the
        // dev server on the same port, so the page received modules from two
        // different Vite optimize passes and hydration died on an undefined
        // internal — with nothing in the console naming the cache as the cause.
        console.warn('[pdkef] No build on this origin; uninstalling the service worker.');
        await removeSelf();
        return;
      }
      throw error;
    }),
  );
});

self.addEventListener('activate', (event) => {
  // Because install does not call skipWaiting(), this runs only once every page
  // from the previous build has closed. That ordering is load-bearing: those
  // pages lazy-import content-hashed chunks long after first paint (pdfjs, its
  // worker, the font files), and an earlier version of this file activated
  // immediately and deleted the very cache they were still resolving against.
  // The visible result was a page that looked fine while the PDF silently never
  // rendered. Waiting costs one visit of staleness and removes that failure.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys.filter((key) => isOwnCache(key) && key !== CACHE_VERSION).map((key) => caches.delete(key)),
      ))
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
