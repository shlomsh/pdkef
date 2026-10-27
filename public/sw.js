// Hand-written, dependency-free service worker. CACHE_VERSION is content-hashed
// per build by scripts/generate-precache-manifest.mjs, so every deploy gets its
// own cache and no two builds ever share one.
//
// Strategy:
//   - Install precaches the whole app, defined by the build manifest (v2) as
//     the shell (`/`, the offline fallback, and what every page shares) plus
//     every page's list: that page's HTML and every script, style, worker and
//     wasm file it reaches, computed at build time and deduped here (appUrls).
//     Guide photos and files no page reaches are left to runtime caching.
//     Best-effort per URL except the root fallback (see precacheUrls). A new
//     build copies its unchanged content-hashed /_astro/ files from the
//     previous build's cache and fetches only the rest, so a redeploy costs
//     the diff, not the site.
//   - HTML navigations are cache-first and refresh in the background, so a
//     returning visitor can reopen the app when the server is unavailable. A
//     refreshed page is stored only when it belongs to this build: its hash
//     must match the page's entry in this build's manifest (MEM-22).
//   - Other same-origin assets are cache-first after precache or first use.
//   - Cross-origin requests are never intercepted — this app makes none
//     in normal operation; not touching them is a deliberate safeguard.
//   - An update never takes over a page from the previous build on its own:
//     install never calls skipWaiting() unconditionally. It runs on
//     SKIP_WAITING_MESSAGE, which the active worker sends on a navigation, and
//     only once every open tab has answered that it holds no work a reload
//     would lose (an export in flight, a file open in a tool without drafts);
//     every tab running this code reloads itself on controllerchange. Deleting
//     a build's cache under a live page breaks its lazy imports, which is why
//     those conditions exist. See handleSkipWaiting and trySilentTakeover.
//     The one other caller is tryForcedTakeover, and only for a build that
//     bumped CRITICAL_VERSION (a fix for a major bug): it tells every tab,
//     waits for each to flush and finish its export (capped), then skips
//     waiting, still only when this build is readyToTakeOver().
//   - One narrow exception to "GET only": a POST to SHARE_TARGET_PATH, which
//     is how Android's share sheet hands PDkef a file from another app (see
//     manifest.webmanifest's share_target). There is no server to answer that
//     POST - this worker is the only thing that ever sees it, so it lifts the
//     file out of the multipart body and parks it in IndexedDB rather than
//     touching the network with it. See handleShareTarget below.
const CACHE_PREFIX = 'pdkef-';
// MEM-13: bumped by hand, by one, only for a build that fixes a major bug (data
// loss, a broken export) and so must reach every open tab now rather than on
// the next quiet navigation. It rides in the cache name so a waiting build can
// read, from the cache keys alone, whether it is critical over the build the
// tabs run. Keys from before this (`pdkef-<hash>`) read as 0.
const CRITICAL_VERSION = 10;
// MEM-22: the build id the generator stamps in, which the manifest carries too.
const BUILD_ID = '__BUILD_ID__';
const CACHE_VERSION = `${CACHE_PREFIX}c${CRITICAL_VERSION}-${BUILD_ID}`;

const PRECACHE_MANIFEST_URL = '/precache-manifest.json';

// The offline fallback that every uncached navigation lands on, and so the one
// precache entry with no second chance at runtime.
const REQUIRED_URL = '/';

// Precaching covers the whole build, which is hundreds of requests. Firing
// them all at once is what makes a phone on a weak connection drop some of
// them, so they go through a small pool instead.
const PRECACHE_CONCURRENCY = 6;

// MEM-23: a request with no limit can stall forever and hold one of the lanes
// above; enough of them and the install never finishes. A request that receives
// nothing for this long is aborted and its URL counts as missed like any other
// failure. A slow download that keeps arriving is never cut off.
const PRECACHE_STALL_MS = 30000;

// SIGN-23: non-default faces are opt-in family packs, provisioned separately and
// not part of the app install. A successful provision stores this synthetic marker
// beside every face in the current build cache. The marker is the explicit
// contract that distinguishes "a face happened to be fetched once" from
// "every advertised style in this family is ready for a disconnected edit
// and export session".
const FONT_PACK_MARKER_PATH = '/__pdkef/offline-font-pack/';
const SKIP_WAITING_MESSAGE = 'pdkef:skip-waiting';
const UPDATE_STATUS_MESSAGE = 'pdkef:update-status';
// Asked of every open tab (src/site-lib/appUpdate.ts answers it).
const BUSY_QUERY_MESSAGE = 'pdkef:busy-query';
const BUSY_TIMEOUT_MS = 750;
// MEM-13: a critical build tells every tab (CRITICAL_UPDATE_MESSAGE) and waits
// for each to reply { ready: true } before it skips waiting. The page holds its
// reply for an export in flight, at most 60s (CRITICAL_PAGE_CAP_MS in
// appUpdate), so this cap sits above it: a tab that never answers cannot
// keep a fix from reaching everyone. The page sends CRITICAL_CHECK_MESSAGE to
// the waiting worker after it looked for an update, so a tab nobody navigates
// in still gets the fix.
const CRITICAL_UPDATE_MESSAGE = 'pdkef:critical-update';
const CRITICAL_CHECK_MESSAGE = 'pdkef:critical-check';
// The page's own cap is 60s plus up to 3s of draft flush, so 75s leaves a 12s margin.
const CRITICAL_TAKEOVER_CAP_MS = 75_000;

// Written into this build's cache once install precached every URL with none
// missed. A waiting build may take over only when it is present: activation
// deletes the old cache, so taking over with a gap would lose offline coverage
// the old build had. See readyToTakeOver.
const PRECACHE_COMPLETE_PATH = '/__pdkef/precache-complete/';
// This build's own manifest, kept so a refreshed page can be checked against it.
const MANIFEST_PATH = '/__pdkef/manifest/';
// How long the silent takeover waits for the waiting worker's answer.
const TAKEOVER_TIMEOUT_MS = 3000;
// After one granted takeover, navigations are served normally for this long.
// Activation waits for the old worker to go idle; were every navigation in
// that window answered with another takeover page, it would never go idle.
const TAKEOVER_COOLDOWN_MS = 10_000;
// After a refusal because a tab did not answer (frozen, or on a build from
// before MEM-10), navigations skip the question for this long rather than
// each waiting out BUSY_TIMEOUT_MS again.
const UNANSWERED_COOLDOWN_MS = 30_000;
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

// The critical version a cache key carries (`pdkef-c<N>-<build>`). Any other
// key, including every `pdkef-<hash>` from before CRITICAL_VERSION existed, is 0.
function criticalVersionOf(cacheKey) {
  if (!isOwnCache(cacheKey)) return 0;
  const match = /^c(\d+)-/.exec(cacheKey.slice(CACHE_PREFIX.length));
  return match ? Number(match[1]) : 0;
}

// Whether a build at ownVersion is critical over the builds already cached
// here. The comparison is against the lowest of them, because that is the
// build the open tabs run: a waiting build that was never taken over leaves its
// own (newer) cache behind until the next activation, and comparing against it
// would stop a later build of the same critical version from forcing. With no
// other build there is nothing to force over (a first install).
function isCriticalOver(ownVersion, otherKeys) {
  return otherKeys.length > 0 && ownVersion > Math.min(...otherKeys.map(criticalVersionOf));
}

// 'no-cache', not 'reload': still validated with the server on every call, so
// a deploy is never served stale, but an unchanged file comes back as a 304
// instead of being downloaded again (reload sends no conditional request).
function fetchFresh(url, signal) {
  return fetch(new Request(resolve(url), { cache: 'no-cache', signal }));
}

// MEM-23: runs `start(signal, touch)` and gives up after PRECACHE_STALL_MS
// without a `touch()`, aborting the request and rejecting even if `start` never
// settles (a body that stalls inside cache.put). The timer is cleared as soon
// as it settles.
async function withPrecacheTimeout(start) {
  const controller = new AbortController();
  let timer;
  let fail;
  const expired = new Promise((_resolve, reject) => {
    fail = reject;
  });
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      controller.abort();
      fail(new Error(`Precache request stalled for ${PRECACHE_STALL_MS} ms`));
    }, PRECACHE_STALL_MS);
  };
  touch();
  try {
    return await Promise.race([start(controller.signal, touch), expired]);
  } finally {
    clearTimeout(timer);
  }
}

// MEM-23: the same response, with every arriving chunk restarting the stall
// timer. Headers are kept (the page reads Server-Timing from cached pages).
function trackProgress(response, touch) {
  if (!response.body) return response;
  const body = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      touch();
      controller.enqueue(chunk);
    },
  }));
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

// MEM-16: only /_astro/ files are content-hashed, so their bytes never change
// under the same URL. Everything else (pages, fonts, wasm, icons) can.
function isHashedUrl(url) {
  return url.startsWith('/_astro/');
}

// Which manifest URLs install copies out of a previous build's cache and which
// it fetches. Pure: previouslyCached is the set of pathnames those caches hold.
// Only a hashed URL already held there is copied; a page or an unhashed asset
// is always fetched, because the same URL may now name different bytes.
function planPrecache(urls, previouslyCached) {
  const copy = [];
  const toFetch = [];
  for (const url of urls) {
    (isHashedUrl(url) && previouslyCached.has(url) ? copy : toFetch).push(url);
  }
  return { copy, fetch: toFetch };
}

async function previousCacheHandles() {
  const keys = await caches.keys();
  return Promise.all(keys.filter((key) => isOwnCache(key) && key !== CACHE_VERSION).map((key) => caches.open(key)));
}

async function pathnamesIn(previousCaches) {
  const held = new Set();
  for (const oldCache of previousCaches) {
    for (const request of await oldCache.keys()) held.add(new URL(request.url).pathname);
  }
  return held;
}

// The hashed file from the first previous cache that holds it, or null.
async function findInPrevious(previousCaches, url) {
  for (const oldCache of previousCaches) {
    const response = await oldCache.match(resolve(url));
    if (response) return response;
  }
  return null;
}

async function loadManifest() {
  const response = await fetchFresh(PRECACHE_MANIFEST_URL);
  if (response.status === 404) {
    throw new OrphanedWorkerError('This origin serves no precache manifest.');
  }
  if (!response.ok) {
    throw new Error(`Failed to load precache manifest: ${response.status}`);
  }
  const manifest = validManifest(await response.json());
  // MEM-22: a manifest served by another build would fill this build's cache
  // with that build's files.
  if (manifest.build !== BUILD_ID) throw new Error('Precache manifest belongs to another build.');
  return manifest;
}

// MEM-15: the whole app is the shell plus every page's list, each URL once.
function appUrls({ shell, pages }) {
  return [...new Set([...shell, ...Object.values(pages).flat()])];
}

function validManifest(manifest) {
  const { version, build, shell, pages, html } = manifest ?? {};
  if (version !== 2 || !Array.isArray(shell) || shell.length === 0 || !pages || typeof pages !== 'object') {
    throw new Error('Precache manifest has no URLs.');
  }
  return { version, build, shell, pages, html };
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

// Per-URL tolerance is deliberate. A weak connection will eventually fail
// something, and an earlier version failed the whole install on the first bad
// response - the visitor then got no offline shell at all and re-downloaded
// the site on their next visit, silently, forever. Anything missed here still
// resolves over the network on demand and is cached on first use by the fetch
// handler below, so a miss costs nothing but the offline guarantee for that one
// asset. Only REQUIRED_URL ('/') is load-bearing enough to fail the install
// over. Resolves to the URLs it did not cache.
async function precacheUrls(cache, urls, previousCaches, { skipCached = false } = {}) {
  const missed = [];
  // MEM-16: carry unchanged hashed files over from the previous build's cache
  // instead of downloading them again. Activate deletes those caches only
  // after this install, so they are still here to read.
  let plan = { copy: [], fetch: urls };
  try {
    plan = planPrecache(urls, await pathnamesIn(previousCaches));
  } catch {
    // No readable previous cache: fetch everything, as a first install does.
  }
  const toCopy = new Set(plan.copy);
  await forEachLimited(urls, PRECACHE_CONCURRENCY, async (url) => {
    if (skipCached && await cache.match(url)) return;
    try {
      if (toCopy.has(url)) {
        const kept = await findInPrevious(previousCaches, url).catch(() => null);
        if (kept) {
          await cache.put(url, kept);
          return;
        }
      }
      await withPrecacheTimeout(async (signal, touch) => {
        const response = isHashedUrl(url) ? await fetch(new Request(resolve(url), { signal })) : await fetchFresh(url, signal);
        if (!response.ok) throw new Error(`Failed to precache ${url}: ${response.status}`);
        await cache.put(url, trackProgress(response, touch));
      });
    } catch (error) {
      if (url === REQUIRED_URL) throw error;
      missed.push(url);
    }
  });
  return missed;
}

// MEM-15: the whole app (see appUrls). Resolves to the number of URLs missed.
async function precacheAppShell({ skipCached = false } = {}) {
  const manifest = await loadManifest();
  const cache = await caches.open(CACHE_VERSION);
  await cache.put(resolve(MANIFEST_PATH), new Response(JSON.stringify(manifest)));
  let previousCaches = [];
  try {
    previousCaches = await previousCacheHandles();
  } catch {
    // No readable previous cache.
  }
  const urls = appUrls(manifest);
  const missed = await precacheUrls(cache, urls, previousCaches, { skipCached });
  if (missed.length > 0) {
    console.warn(`[pdkef] ${missed.length}/${urls.length} assets are not cached for offline use; they will load from the network.`);
  }
  return missed.length;
}

// A build is ready to take over from the previous one only when it is fully
// precached and the device is online. Offline, a build that is not
// fully cached would replace one that is, and the offline coverage would be
// lost for good.
async function readyToTakeOver() {
  const cache = await caches.open(CACHE_VERSION);
  const complete = !!await cache.match(resolve(PRECACHE_COMPLETE_PATH));
  return complete && self.navigator?.onLine !== false;
}

async function markPrecacheComplete() {
  const cache = await caches.open(CACHE_VERSION);
  await cache.put(resolve(PRECACHE_COMPLETE_PATH), new Response('ok'));
}

// Install misses a URL now and then on a weak connection, and then this build
// would never be ready: the same sw.js bytes never install again, so the
// update would wait for every tab to close. Asked about readiness while
// online, a waiting build fetches only what is still missing, one pass at a
// time, and marks itself complete once nothing is.
let completingPrecache = null;
function completePrecache() {
  if (!completingPrecache) {
    completingPrecache = precacheAppShell({ skipCached: true })
      .then((missed) => (missed === 0 ? markPrecacheComplete() : undefined))
      .catch(() => {})
      .finally(() => { completingPrecache = null; });
  }
  return completingPrecache;
}

// readyToTakeOver(), starting completePrecache() in the background when only
// the precache stands in the way.
async function readyOrCompleting(event) {
  const ready = await readyToTakeOver();
  if (!ready && self.navigator?.onLine !== false) event.waitUntil(completePrecache());
  return ready;
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

// MEM-22: the first 16 hex characters of the body's SHA-256, as pageHash in
// scripts/pageHash.mjs computes them for the manifest's `html` map.
async function hashBody(response) {
  const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
  return Array.from(new Uint8Array(digest).subarray(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// True only when this build's stored manifest lists the page with these bytes.
async function belongsToThisBuild(cache, cacheKey, response) {
  try {
    const stored = await cache.match(resolve(MANIFEST_PATH));
    const expected = stored ? (await stored.json()).html?.[cacheKey] : undefined;
    return !!expected && expected === await hashBody(response.clone());
  } catch {
    return false;
  }
}

async function refreshNavigation(request, cache, cacheKey) {
  try {
    const response = await fetch(request);
    if (response.ok && await belongsToThisBuild(cache, cacheKey, response)) await cache.put(cacheKey, response.clone());
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
// name, store name, keyPath, and the `handoff:<tool>` key prefix) so
// the Sign tool's existing takeHandoff('sign') restore path - the same one
// FileDropzone's home-page drop already feeds - picks this up with no changes
// on that side. Duplicated rather than imported: this file is registered as
// a classic script (see BaseLayout.astro's `navigator.serviceWorker.register`
// call, no `{ type: 'module' }`), so it cannot `import` draftStore.js. If the
// handoff schema in draftStore.js ever changes, this must change with it.
const DRAFTS_DB_NAME = 'pdf-toolkit-workspace';
const DRAFTS_STORE_NAME = 'workspace';
const DRAFTS_DB_VERSION = 1;
const handoffKey = (tool) => `handoff:${tool}`;

function openDraftsDb() {
  return new Promise((resolvePromise, reject) => {
    const request = indexedDB.open(DRAFTS_DB_NAME, DRAFTS_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFTS_STORE_NAME)) {
        db.createObjectStore(DRAFTS_STORE_NAME, { keyPath: 'tool' });
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
  // Deliberately no skipWaiting() here: a new build must not take control of a
  // page that is still running the previous one just because it installed.
  // Activation is requested later by SKIP_WAITING_MESSAGE (see handleSkipWaiting),
  // or by tryForcedTakeover for a build that bumped CRITICAL_VERSION.
  const installed = precacheAppShell().then((missed) => (missed === 0 ? markPrecacheComplete() : undefined)).catch(async (error) => {
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
  });
  event.waitUntil(installed);
  // MEM-13: after install, not part of it, so a critical build's wait for the
  // tabs never holds the install open. A failed install forces nothing.
  installed.then(afterInstallSettles).then(tryForcedTakeover, () => {
    // expected: a failed install is already reported by install itself; nothing to force.
  });
});

self.addEventListener('activate', (event) => {
  // Because install does not call skipWaiting(), this runs either once every
  // page from the previous build has closed, or after a SKIP_WAITING_MESSAGE
  // that handleSkipWaiting accepted (every open tab answered it is idle and
  // reloads on controllerchange). That ordering is load-bearing: those
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

async function httpWindows() {
  return (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .filter((client) => /^https?:$/.test(new URL(client.url).protocol));
}

// Whether one open tab holds work a reload would lose: true, false, or null
// when it does not answer in time (a frozen tab, or a page from a build before
// MEM-10, which has no answer and no controllerchange reload either).
function askBusy(client) {
  return new Promise((resolvePromise) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolvePromise(null), BUSY_TIMEOUT_MS);
    channel.port1.onmessage = (message) => {
      clearTimeout(timer);
      channel.port1.close();
      resolvePromise(message.data?.busy === true);
    };
    client.postMessage({ type: BUSY_QUERY_MESSAGE }, [channel.port2]);
  });
}

// Every open page but `excludeId`. Only page URLs count: every canonical page
// URL ends in a slash, and other same-origin documents (a sitemap, robots.txt,
// a blob: download) run no app code, so they can neither answer nor lose
// anything to a reload. surveyWindows asks them all at once.
async function pageWindows(excludeId) {
  return (await httpWindows())
    .filter((client) => client.id !== excludeId && new URL(client.url).pathname.endsWith('/'));
}

async function surveyWindows(excludeId) {
  const windows = await pageWindows(excludeId);
  const answers = await Promise.all(windows.map(askBusy));
  return {
    windows: windows.length,
    busy: answers.filter((answer) => answer === true).length,
    silent: answers.filter((answer) => answer === null).length,
  };
}

// One of two skipWaiting() calls in this file (the other is tryForcedTakeover's),
// and neither runs unconditionally on install. The
// active worker sends this on a navigation (trySilentTakeover). It is granted
// only when this build is readyToTakeOver() (fully precached and online, so
// activation never costs the device offline coverage) and every open tab
// answered that it is idle. The navigating tab answers idle: it is leaving its
// page. Every tab running this code reloads itself on controllerchange, so no
// page keeps running an old build against a deleted cache, which is the reason
// skipWaiting used to be banned.
async function handleSkipWaiting(event) {
  const reply = event.ports?.[0];
  const ready = await readyOrCompleting(event);
  const survey = ready ? await surveyWindows() : { windows: 0, busy: 0, silent: 0 };
  const ok = ready && survey.busy === 0 && survey.silent === 0;
  // Reply first: the silent takeover's active worker is holding a navigation
  // open on this answer, and activation waits for that navigation to finish.
  reply?.postMessage({ ok, ready, ...survey });
  if (ok) await self.skipWaiting();
}

// For the update line in one tab: is this build ready, and what do the other
// tabs say? A tab shows the line only when another one holds the update.
async function handleUpdateStatus(event) {
  const ready = await readyOrCompleting(event);
  const survey = ready ? await surveyWindows(event.source?.id) : { windows: 0, busy: 0, silent: 0 };
  event.ports?.[0]?.postMessage({ ready, ...survey });
}

// Active worker, on a navigation: if a build is waiting, ask it to take over
// (handleSkipWaiting decides) and answer with a takeover page so the browser
// asks the new worker for the page once it is active. The tab is leaving its
// page anyway, and every other tab answered idle and reloads itself, so no
// live page runs against the cache activation deletes. This is how an update
// reaches anyone without a line or a click. Returns a Response, or null to
// fall through to the normal navigation handling.
let lastTakeoverAt = -Infinity;
let lastUnansweredAt = -Infinity;
async function trySilentTakeover() {
  try {
    const waiting = self.registration?.waiting;
    if (!waiting) return null;
    // Offline the answer is no, so the waiting worker is not even woken.
    if (self.navigator?.onLine === false) return null;
    const now = Date.now();
    if (now - lastTakeoverAt < TAKEOVER_COOLDOWN_MS) return null;
    if (now - lastUnansweredAt < UNANSWERED_COOLDOWN_MS) return null;
    const channel = new MessageChannel();
    const reply = new Promise((resolvePromise) => {
      channel.port1.onmessage = (message) => resolvePromise(message.data);
      setTimeout(() => resolvePromise(null), TAKEOVER_TIMEOUT_MS);
    });
    waiting.postMessage({ type: SKIP_WAITING_MESSAGE }, [channel.port2]);
    const answer = await reply;
    channel.port1.close();
    if (answer?.silent > 0) lastUnansweredAt = Date.now();
    if (!answer?.ok) return null;
    lastTakeoverAt = Date.now();
    return takeoverResponse();
  } catch {
    return null;
  }
}

// A blank page that loads the page again after a second. It asks nothing of
// this worker, so the old worker goes idle and the new one can activate
// (Chromium activates after about a second, measured in the MEM-10 e2e); the
// refresh then reaches the new build. Answering with an instant refresh kept
// the old worker busy with navigation after navigation, and activation waited
// behind them. A refresh that still beats activation gets the old page (the
// cooldown), and that page reloads itself on controllerchange.
function takeoverResponse() {
  return new Response(
    '<!doctype html><meta name="color-scheme" content="light dark"><meta http-equiv="refresh" content="1">',
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'",
      },
    },
  );
}

// MEM-13. Whether this worker is the registration's waiting one: the installing
// worker is not yet, a replaced one never is again. Where the worker cannot name
// itself (self.serviceWorker is missing), a waiting worker is taken to be this.
function isWaitingWorker() {
  const waiting = self.registration?.waiting;
  return !!waiting && (!self.serviceWorker || waiting === self.serviceWorker);
}

// Other builds' caches. No filter by activity is possible from here, so the
// caller leaves it to isCriticalOver.
async function otherBuildKeys() {
  return (await caches.keys()).filter((key) => isOwnCache(key) && key !== CACHE_VERSION);
}

// Ready to take over, finishing a missing precache first when only that stands
// in the way (online), exactly as a navigation's question would.
async function readyForForce() {
  if (await readyToTakeOver()) return true;
  if (self.navigator?.onLine === false) return false;
  await completePrecache();
  return readyToTakeOver();
}

// One tab's answer to CRITICAL_UPDATE_MESSAGE: resolves once it replies
// { ready: true }, which the page sends after flushing its draft saves and
// waiting out an export. A tab that cannot be messaged has nothing to wait for.
function askCriticalReady(client) {
  return new Promise((resolvePromise) => {
    try {
      const channel = new MessageChannel();
      channel.port1.onmessage = (message) => {
        if (message.data?.ready !== true) return;
        channel.port1.close();
        resolvePromise();
      };
      client.postMessage({ type: CRITICAL_UPDATE_MESSAGE }, [channel.port2]);
    } catch {
      resolvePromise();
    }
  });
}

async function waitForCriticalReady(windows) {
  let timer;
  const cap = new Promise((resolvePromise) => { timer = setTimeout(resolvePromise, CRITICAL_TAKEOVER_CAP_MS); });
  await Promise.race([Promise.all(windows.map(askCriticalReady)), cap]);
  clearTimeout(timer);
}

async function forceTakeover() {
  if (!isWaitingWorker()) return;
  if (!isCriticalOver(CRITICAL_VERSION, await otherBuildKeys())) return;
  if (!await readyForForce()) return;
  await waitForCriticalReady(await pageWindows());
  // Re-checked after the wait, which can be a minute: the device may have gone
  // offline or a newer build replaced this one, and neither may be taken over.
  if (isWaitingWorker() && await readyToTakeOver()) await self.skipWaiting();
}

// Waiting worker, for a build that bumped CRITICAL_VERSION: take over without
// a navigation, after every tab said it is ready. It does nothing for any other
// build, so MEM-10's behaviour is untouched. Single-flight: the install-time
// call and a pdkef:critical-check share one run.
let forcing = null;
function tryForcedTakeover() {
  if (!forcing) {
    forcing = forceTakeover()
      .catch(() => {
        // expected: a failed force is retried by the next pdkef:critical-check.
      })
      .finally(() => { forcing = null; });
  }
  return forcing;
}

// Install's promise settles while this worker is still `installing`, and only a
// waiting worker may force; resolves once it is no longer installing.
function afterInstallSettles() {
  const worker = self.serviceWorker;
  if (!worker || worker.state !== 'installing') return Promise.resolve();
  return new Promise((resolvePromise) => worker.addEventListener('statechange', resolvePromise, { once: true }));
}

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (type === CRITICAL_CHECK_MESSAGE) {
    event.waitUntil(tryForcedTakeover());
    return;
  }
  if (type === SKIP_WAITING_MESSAGE) {
    event.waitUntil(handleSkipWaiting(event));
    return;
  }
  if (type === UPDATE_STATUS_MESSAGE) {
    event.waitUntil(handleUpdateStatus(event));
    return;
  }
  if (![FONT_PACK_MESSAGE.status, FONT_PACK_MESSAGE.provision].includes(type)) return;
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
    event.respondWith((async () => {
      const takeover = await trySilentTakeover();
      if (takeover) return takeover;
      return caches.open(CACHE_VERSION).then(async (cache) => {
        const cacheKey = navigationCacheKey(request);
        const cached = await cache.match(cacheKey);
        if (cached) {
          event.waitUntil(refreshNavigation(request, cache, cacheKey));
          return cached;
        }
        const response = await refreshNavigation(request, cache, cacheKey);
        return response ?? cache.match('/');
      });
    })());
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
