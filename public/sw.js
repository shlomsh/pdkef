// Hand-written, dependency-free service worker. Bump CACHE_VERSION on any
// deploy where you want clients to drop their old cache.
//
// Strategy:
//   - HTML (navigations): network-first, falling back to the cached shell
//     when offline. Keeps the page fresh when online, since asset
//     filenames change on build.
//   - Non-hashed same-origin assets (favicon.png, manifest.webmanifest, icons, etc.):
//     network-first, falling back to the cache when offline. This ensures
//     logo and configuration changes are picked up immediately when online.
//   - Content-hashed same-origin assets (JS/CSS under /_astro/):
//     cache-first, populated as each asset is first requested.
//   - Cross-origin requests are never intercepted — this app makes none
//     in normal operation; not touching them is a deliberate safeguard.
const CACHE_VERSION = 'pdkef-v3';

const PRECACHE_URLS = ['/', '/favicon.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => {
        // Force request to bypass HTTP cache to ensure we get fresh assets
        const cachePromises = PRECACHE_URLS.map((url) => {
          return fetch(new Request(url, { cache: 'reload' }))
            .then((response) => {
              if (response.ok) {
                return cache.put(url, response);
              }
              throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
            })
            .catch(() => {
              // Fallback if reload cache mode is unsupported or fails
              return fetch(url).then((response) => cache.put(url, response));
            });
        });
        return Promise.all(cachePromises);
      })
      .then(() => self.skipWaiting()),
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

  // 1. Navigation requests (HTML pages): Network-first with root fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match('/'))),
    );
    return;
  }

  // 2. Non-hashed assets (favicon, manifest, icons, etc.): Network-first
  const isHashedAsset = url.pathname.startsWith('/_astro/');
  if (!isHashedAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  // 3. Content-hashed assets (JS/CSS built by Astro): Cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
