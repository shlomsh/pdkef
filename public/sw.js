// Hand-written, dependency-free service worker. CACHE_VERSION is content-hashed
// per build by scripts/generate-precache-manifest.mjs, so every deploy gets its
// own cache and no two builds ever share one.
//
// Strategy:
//   - The built application shell (every page, script and style - everything
//     except fonts) is precached during install, best-effort per URL except
//     the root fallback (see precacheAppShell and precacheFilter.mjs). A
//     service worker can never intercept the navigation that first registers
//     it, so a page's own first-ever load - including a `client:load`
//     island's hydration bundle - happens uncontrolled and uncached; without
//     precaching the app up front, reopening any tool offline would need a
//     second, separate online visit first just to warm it.
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

// Precaching covers the whole build, which is hundreds of requests. Firing
// them all at once is what makes a phone on a weak connection drop some of
// them, so they go through a small pool instead.
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

  // Per-URL tolerance is deliberate. This precaches every page and script
  // chunk in the build, so on a weak connection something will eventually
  // fail, and an earlier version failed the whole install on the first bad
  // response - the visitor then got no offline shell at all and
  // re-downloaded the entire site on their next visit, silently, forever.
  // Anything missed here still resolves over the network on demand and is
  // cached on first use by the fetch handler below, so a miss costs nothing
  // but the offline guarantee for that one asset. Only REQUIRED_URL ('/')
  // is load-bearing enough to fail the install over.
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
  //
  // Matched and stored by the URL string, not the live `request` object -
  // load-bearing, not a style choice. Chromium fails to match a cached entry
  // against `event.request` itself when `request.destination === 'script'`
  // (a `<script type=module>` or, critically, a dynamic `import()` - exactly
  // how every `client:load` island loads its own hydration bundle), even
  // though the identical URL matches fine as a plain string against the same
  // cache. Found precaching this app's own islands: every tool's script chunk
  // was verifiably precached (confirmed present via `cache.keys()`), yet
  // `cache.match(request)` still reported a miss for it alone - `image`- and
  // other-destination requests on the same page matched normally throughout.
  // The effect: every tool would 404 its own hydration bundle offline
  // (`[astro-island] Error hydrating ... Failed to fetch dynamically imported
  // module`) even with a complete, verified cache. Passing `request.url`
  // sidesteps whatever internal state Chromium attaches to the module-loader's
  // Request object.
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) => cache.match(request.url).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          cache.put(request.url, copy);
        }
        return response;
      });
    })),
  );
});
