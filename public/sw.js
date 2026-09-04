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
//   - One narrow exception to "GET only": a POST to SHARE_TARGET_PATH, which
//     is how Android's share sheet hands PDkef a file from another app (see
//     manifest.webmanifest's share_target). There is no server to answer that
//     POST - this worker is the only thing that ever sees it, so it lifts the
//     file out of the multipart body and parks it in IndexedDB rather than
//     touching the network with it. See handleShareTarget below.
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

// SIGN-23: non-default faces are opt-in family packs, not part of the initial
// ~37 MB app download. A successful provision stores this synthetic marker
// beside every face in the current build cache. The marker is the explicit
// contract that distinguishes "a face happened to be fetched once" from
// "every advertised style in this family is ready for a disconnected edit
// and export session".
const FONT_PACK_MARKER_PATH = '/__pdkef/offline-font-pack/';
const FONT_PACK_MESSAGE = {
  status: 'pdkef:font-pack-status',
  provision: 'pdkef:font-pack-provision',
};

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

function validFontPack(pack) {
  return !!pack
    && typeof pack.family === 'string'
    && pack.family.length > 0
    && pack.family.length <= 100
    && Array.isArray(pack.urls)
    && pack.urls.length > 0
    && pack.urls.length <= 4
    && pack.urls.every((url) => typeof url === 'string' && /^\/fonts\/[A-Za-z0-9-]+\.ttf$/.test(url));
}

function fontPackMarker(family) {
  return `${FONT_PACK_MARKER_PATH}${encodeURIComponent(family)}`;
}

async function fontPackReady(cache, pack) {
  if (!await cache.match(resolve(fontPackMarker(pack.family)))) return false;
  const faces = await Promise.all(pack.urls.map((url) => cache.match(resolve(url))));
  return faces.every(Boolean);
}

async function writeFontPackMarker(cache, pack) {
  await cache.put(resolve(fontPackMarker(pack.family)), new Response(JSON.stringify(pack), {
    headers: { 'Content-Type': 'application/json' },
  }));
}

async function provisionFontPack(cache, pack) {
  await forEachLimited(pack.urls, 2, async (url) => {
    if (await cache.match(resolve(url))) return;
    const response = await fetchFresh(url);
    if (!response.ok) throw new Error(`Failed to provision ${pack.family}: ${response.status}`);
    await cache.put(resolve(url), response);
  });
  await writeFontPackMarker(cache, pack);
}

async function readProvisionedPacks(cache) {
  const requests = await cache.keys();
  const markers = requests.filter((request) => new URL(request.url).pathname.startsWith(FONT_PACK_MARKER_PATH));
  const packs = [];
  for (const marker of markers) {
    try {
      const response = await cache.match(marker);
      const pack = await response.json();
      if (validFontPack(pack)) packs.push(pack);
    } catch {
      // A corrupt marker is not a provisioned pack and is safe to ignore.
    }
  }
  return packs;
}

// Revalidate installed packs into the new build cache before old app caches
// are deleted. If activation happens without a network, retain the old bytes;
// the next build can still render/export rather than silently losing a pack.
async function migrateFontPacks(previousCaches, currentCache) {
  const installed = new Map();
  for (const cache of previousCaches) {
    for (const pack of await readProvisionedPacks(cache)) installed.set(pack.family, pack);
  }
  await forEachLimited([...installed.values()], 2, async (pack) => {
    let complete = true;
    for (const url of pack.urls) {
      let response = null;
      try {
        const fresh = await fetchFresh(url);
        if (fresh.ok) response = fresh;
      } catch {
        // Fall through to the retained face below.
      }
      if (!response) {
        for (const oldCache of previousCaches) {
          response = await oldCache.match(resolve(url));
          if (response) break;
        }
      }
      if (!response) {
        complete = false;
        break;
      }
      await currentCache.put(resolve(url), response.clone());
    }
    if (complete) await writeFontPackMarker(currentCache, pack);
  });
}

async function handleFontPackMessage(data) {
  const packs = Array.isArray(data?.packs) ? data.packs : [];
  if (packs.length === 0 || !packs.every(validFontPack)) throw new Error('Invalid offline font pack.');
  const cache = await caches.open(CACHE_VERSION);
  if (data.type === FONT_PACK_MESSAGE.provision) {
    await forEachLimited(packs, 2, (pack) => provisionFontPack(cache, pack));
  }
  return Object.fromEntries(await Promise.all(
    packs.map(async (pack) => [pack.family, await fontPackReady(cache, pack)]),
  ));
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

// --- Web Share Target (DEMO-03) -------------------------------------------
//
// The manifest's share_target.action - there is no real page or server behind
// it; the sole purpose of this path is to be POSTed to and intercepted here.
const SHARE_TARGET_PATH = '/share-target/';
// Which tool the shared file opens in, and the multipart field name the
// browser fills from manifest.webmanifest's share_target.params.files[0].name.
// Keep both in sync with the manifest if either ever changes.
const SHARE_TARGET_TOOL = 'sign';
const SHARE_TARGET_FIELD = 'pdf';

// Mirrors src/editor/workspace/draftStore.js's handoff schema exactly (DB
// name/version, store name, keyPath, and the `handoff:<tool>` key prefix) so
// the Sign tool's existing takeHandoff('sign') restore path - the same one
// FileDropzone's home-page drop already feeds - picks this up with no changes
// on that side. Duplicated rather than imported: this file is registered as
// a classic script (see BaseLayout.astro's `navigator.serviceWorker.register`
// call, no `{ type: 'module' }`), so it cannot `import` draftStore.js. If the
// handoff schema in draftStore.js ever changes, this must change with it.
const DRAFTS_DB_NAME = 'pdf-toolkit-drafts';
const DRAFTS_STORE_NAME = 'drafts';
const DRAFTS_SOURCE_STORE_NAME = 'sources';
const DRAFTS_DB_VERSION = 2;
const handoffKey = (tool) => `handoff:${tool}`;

function openDraftsDb() {
  return new Promise((resolvePromise, reject) => {
    const request = indexedDB.open(DRAFTS_DB_NAME, DRAFTS_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFTS_STORE_NAME)) {
        db.createObjectStore(DRAFTS_STORE_NAME, { keyPath: 'tool' });
      }
      // Keep the schema upgrade complete even when the service worker is the
      // first opener (for example, a Web Share Target handoff before the app
      // has loaded). The editor owns this store; the worker merely creates it
      // so a later editor save can content-address the source PDF safely.
      if (!db.objectStoreNames.contains(DRAFTS_SOURCE_STORE_NAME)) {
        db.createObjectStore(DRAFTS_SOURCE_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolvePromise(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Stores the shared file's bytes under the same handoff key FileDropzone's
// saveHandoff() writes, so the Sign tool's mount-time takeHandoff('sign')
// finds it unmodified. Nothing here ever calls fetch() with the file - the
// bytes only ever move from the POST body into IndexedDB, never back onto
// the network, so the "no file bytes leave the device" invariant holds.
async function saveShareHandoff(file) {
  const fileBytes = await file.arrayBuffer();
  const db = await openDraftsDb();
  try {
    await new Promise((resolvePromise, reject) => {
      const tx = db.transaction(DRAFTS_STORE_NAME, 'readwrite');
      tx.objectStore(DRAFTS_STORE_NAME).put({
        tool: handoffKey(SHARE_TARGET_TOOL),
        fileName: file.name || 'shared.pdf',
        fileType: file.type || 'application/pdf',
        fileBytes,
        savedAt: Date.now(),
      });
      tx.oncomplete = () => resolvePromise();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Handles the share-sheet POST. Always redirects to the destination tool
// (even when nothing usable came through) since that is where a person
// expects to land after picking PDkef from the share sheet, and a 303 turns
// this into a normal GET navigation that the fetch handler's own
// navigation-caching branch below then serves exactly as any other visit.
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get(SHARE_TARGET_FIELD);
    if (file && typeof file === 'object' && typeof file.arrayBuffer === 'function' && file.size > 0) {
      await saveShareHandoff(file);
    } else {
      console.warn('[pdkef] Share target POST carried no usable file.');
    }
  } catch (error) {
    console.error('[pdkef] Failed to read a shared PDF:', error);
  }
  return Response.redirect(resolve(`/${SHARE_TARGET_TOOL}/`), 303);
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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const previousKeys = keys.filter((key) => isOwnCache(key) && key !== CACHE_VERSION);
    const previousCaches = await Promise.all(previousKeys.map((key) => caches.open(key)));
    const currentCache = await caches.open(CACHE_VERSION);
    await migrateFontPacks(previousCaches, currentCache);
    await Promise.all(previousKeys.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (![FONT_PACK_MESSAGE.status, FONT_PACK_MESSAGE.provision].includes(event.data?.type)) return;
  const reply = event.ports?.[0];
  if (!reply) return;
  event.waitUntil(
    handleFontPackMessage(event.data)
      .then((ready) => reply.postMessage({ ok: true, ready }))
      .catch((error) => reply.postMessage({ ok: false, error: error.message })),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 0. Web Share Target: see the SHARE_TARGET_PATH block above. Scoped to
  // this exact path so it can never shadow a real POST this app might add
  // later, and checked before the GET-only bail below since this is a POST.
  if (request.method === 'POST' && url.pathname === SHARE_TARGET_PATH) {
    event.respondWith(handleShareTarget(request));
    return;
  }

  if (request.method !== 'GET') return;

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
