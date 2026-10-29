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
//     must match the page's entry in this build's manifest (MEM-22). A page
//     counts as cached only with its whole closure (MEM-28, servableFromCache).
//   - Other same-origin assets are cache-first after precache or first use,
//     except a non-hashed file asked for by a page that came from another
//     build on the network: that page gets the network's file (MEM-28).
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
const CRITICAL_VERSION = 11;
// MEM-22: the build id the generator stamps in, which the manifest carries too.
const BUILD_ID = '__BUILD_ID__';
const CACHE_VERSION = `${CACHE_PREFIX}c${CRITICAL_VERSION}-__BUILD_ID__`;

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
// MEM-28: the clients whose page came from another build on the network (see
// rememberNetworkClient), kept in this build's cache so a restarted worker still
// knows them; activation deletes the list with the cache. The newest few only.
const NETWORK_CLIENTS_PATH = '/__pdkef/network-clients/';
const NETWORK_CLIENTS_KEPT = 50;
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

// MEM-24: an install that fails for any other reason carries one reason code, so
// the record below never depends on matching message text. The codes are the
// closed list the page reports: other_build, manifest_unreadable, storage,
// root_unreachable, root_mismatch (files_missed comes from the retry, not here).
class InstallFailure extends Error {
  constructor(message, reason) {
    super(message);
    this.reason = reason;
  }
}

// Re-tag whatever a step threw, keeping its message.
function tagFailure(error, reason) {
  return error instanceof InstallFailure ? error : new InstallFailure(error?.message, reason);
}

// A cache write that throws is a storage problem (quota, evicted origin).
async function asStorage(work) {
  try {
    return await work();
  } catch (error) {
    throw tagFailure(error, 'storage');
  }
}

// MEM-24: the worker only records why it failed; the page reads this cache and
// reports. The name sits outside the app's cache prefix on purpose, so
// isOwnCache and every cleanup (activate, removeSelf) ignore it.
const MAINT_CACHE = 'maint-sw-v1';
const MAINT_RECORD_BOUND_MS = 2000;

function missedBucket(count) {
  if (count <= 0) return '0';
  if (count === 1) return '1';
  if (count <= 5) return '2-5';
  if (count <= 20) return '6-20';
  return '21+';
}

// Never throws and sends nothing.
async function recordInstallFailure(reason, bucket) {
  try {
    const cache = await caches.open(MAINT_CACHE);
    await cache.put(
      resolve(`/__maint/sw-install/${BUILD_ID}`),
      new Response(JSON.stringify({ v: 1, build: BUILD_ID, reason, missed: bucket })),
    );
  } catch {
    // Reporting is best effort; it must not change how the install ends.
  }
}

// The install awaits the record, but never for long.
async function recordBounded(reason, bucket) {
  let timer;
  const bound = new Promise((resolveBound) => { timer = setTimeout(resolveBound, MAINT_RECORD_BOUND_MS); });
  await Promise.race([recordInstallFailure(reason, bucket), bound]);
  clearTimeout(timer);
}

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
  let response;
  try {
    response = await fetchFresh(PRECACHE_MANIFEST_URL);
  } catch (error) {
    throw tagFailure(error, 'manifest_unreadable');
  }
  if (response.status === 404) {
    throw new OrphanedWorkerError('This origin serves no precache manifest.');
  }
  if (!response.ok) {
    throw new InstallFailure(`Failed to load precache manifest: ${response.status}`, 'manifest_unreadable');
  }
  let manifest;
  try {
    manifest = validManifest(await response.json());
  } catch (error) {
    throw tagFailure(error, 'manifest_unreadable');
  }
  // MEM-22: a manifest served by another build would fill this build's cache
  // with that build's files.
  if (manifest.build !== BUILD_ID) throw new InstallFailure('Precache manifest belongs to another build.', 'other_build');
  return manifest;
}

// MEM-15: the whole app is the shell plus every page's list, each URL once.
function appUrls({ shell, pages }) {
  return [...new Set([...shell, ...Object.values(pages).flat()])];
}

function validManifest(manifest) {
  const { version, build, shell, pages, hashes } = manifest ?? {};
  if (version !== 2 || !Array.isArray(shell) || shell.length === 0 || !pages || typeof pages !== 'object') {
    throw new Error('Precache manifest has no URLs.');
  }
  if (!hashes || typeof hashes !== 'object') throw new Error('Precache manifest has no hashes.');
  return { version, build, shell, pages, hashes };
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
async function precacheUrls(cache, urls, previousCaches, { skipCached = false, hashes = {} } = {}) {
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
          await asStorage(() => cache.put(url, kept));
          return;
        }
      }
      await withPrecacheTimeout(async (signal, touch) => {
        let response = isHashedUrl(url) ? await fetch(new Request(resolve(url), { signal })) : await fetchFresh(url, signal);
        if (!response.ok) throw new Error(`Failed to precache ${url}: ${response.status}`);
        const expected = hashes[url];
        if (!expected) {
          await asStorage(() => cache.put(url, trackProgress(response, touch)));
          return;
        }
        // MEM-22: an unhashed file is stored only with the bytes this build's
        // manifest names, so a deploy landing mid-install cannot mix builds.
        // Reading the body counts as progress for the stall timer.
        let bytes = await trackProgress(response, touch).arrayBuffer();
        if (await hashBytes(bytes) !== expected) {
          // MEM-29: ask once more, past the HTTP cache, before calling the file
          // another build's: a phone failed every install of a fix on `/` alone.
          response = await fetch(new Request(resolve(url), { cache: 'reload', signal }));
          if (!response.ok) throw new Error(`Failed to precache ${url}: ${response.status}`);
          bytes = await trackProgress(response, touch).arrayBuffer();
        }
        if (await hashBytes(bytes) !== expected) throw new InstallFailure(`Precache ${url} is not this build's file.`, 'root_mismatch');
        await asStorage(() => cache.put(url, new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers })));
      });
    } catch (error) {
      if (url === REQUIRED_URL) throw tagFailure(error, 'root_unreachable');
      missed.push(url);
    }
  });
  return missed;
}

// MEM-15: the whole app (see appUrls). Resolves to the number of URLs missed.
async function precacheAppShell({ skipCached = false } = {}) {
  const manifest = await loadManifest();
  const cache = await asStorage(() => caches.open(CACHE_VERSION));
  await asStorage(() => cache.put(resolve(MANIFEST_PATH), new Response(JSON.stringify(manifest))));
  let previousCaches = [];
  try {
    previousCaches = await previousCacheHandles();
  } catch {
    // No readable previous cache.
  }
  const urls = appUrls(manifest);
  const missed = await precacheUrls(cache, urls, previousCaches, { skipCached, hashes: manifest.hashes });
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
  const cache = await asStorage(() => caches.open(CACHE_VERSION));
  await asStorage(() => cache.put(resolve(PRECACHE_COMPLETE_PATH), new Response('ok')));
  // MEM-24: a files_missed record from an earlier pass is stale once this build is complete.
  try {
    if (!(await caches.keys()).includes(MAINT_CACHE)) return;
    const maint = await caches.open(MAINT_CACHE);
    await maint.delete(resolve(`/__maint/sw-install/${BUILD_ID}`));
  } catch {
    // best effort
  }
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
      .then((missed) => {
        if (missed === 0) return markPrecacheComplete();
        // MEM-24: awaited (bounded) so a stopping worker keeps it; off the install path.
        return recordBounded('files_missed', missedBucket(missed));
      })
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

// MEM-29: a failed install leaves the active worker in charge, and a build that
// bumped CRITICAL_VERSION exists to replace that worker. So when one cannot
// install over an older critical version because `/` is not its file, even past
// the HTTP cache, it unregisters the registration: open pages keep their worker
// and its cache until they close, and the next load comes from the network and
// installs afresh. Only for root_mismatch, the failure a phone repeated for a day:
// offline (root_unreachable, manifest_unreadable) the older build is what opens
// the app, another deploy (other_build) brings its own worker, and a full disk
// (storage) frees nothing. The unregister is never awaited: its job queues behind
// this install's, so waiting on it from inside install held the install open for
// good (WebKit, 2026-10-29).
async function releaseOlderBuild(reason) {
  if (reason !== 'root_mismatch') return;
  try {
    if (isCriticalOver(CRITICAL_VERSION, await otherBuildKeys())) self.registration?.unregister().catch(() => {});
  } catch {
    // expected: no readable cache keys means nothing to release.
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
    if (!await mayStore(cache, url, response)) throw new Error(`Failed to provision ${pack.family}: ${url} is not this build's file.`);
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
        if (fresh.ok && await mayStore(currentCache, url, fresh)) response = fresh;
      } catch {
        // Fall through to the retained face below.
      }
      if (!response) {
        for (const oldCache of previousCaches) {
          const kept = await oldCache.match(resolve(url));
          // A face kept from another build keeps its URL, not its bytes.
          if (kept && await mayStore(currentCache, url, kept)) {
            response = kept;
            break;
          }
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
// scripts/pageHash.mjs computes them for the manifest's `hashes` map.
async function hashBytes(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest).subarray(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// This build's manifest, read from the copy stored at install and parsed once
// per worker lifetime. A missing or unreadable manifest is not remembered, so
// the next caller looks again (null for now).
let storedManifest = null;
async function manifestOfThisBuild(cache) {
  if (!storedManifest) {
    const reading = (async () => {
      const stored = await cache.match(resolve(MANIFEST_PATH));
      const manifest = stored ? await stored.json() : null;
      if (!manifest?.hashes || typeof manifest.hashes !== 'object') throw new Error('No stored manifest hashes.');
      return manifest;
    })();
    storedManifest = reading;
    reading.catch(() => { if (storedManifest === reading) storedManifest = null; });
  }
  try {
    return await storedManifest;
  } catch {
    return null;
  }
}

async function hashesOfThisBuild(cache) {
  return (await manifestOfThisBuild(cache))?.hashes ?? null;
}

// MEM-28: the cached page, but only when every file of its closure (the
// manifest's pages[key]) is cached too. Install tolerates misses, and the
// network may since have moved to a build without them, so a page missing one
// would load half. Such a page counts as uncached. The precache-complete marker
// answers for every page at once; without a readable manifest nothing can be
// checked, so nothing is served.
async function servableFromCache(cache, cacheKey) {
  const cached = await cache.match(cacheKey);
  if (!cached || await cache.match(resolve(PRECACHE_COMPLETE_PATH))) return cached;
  const manifest = await manifestOfThisBuild(cache);
  if (!manifest) return undefined;
  const closure = manifest.pages?.[cacheKey] ?? [];
  if (!Array.isArray(closure)) return undefined;
  const held = await Promise.all(closure.map((url) => cache.match(resolve(url))));
  return held.every(Boolean) ? cached : undefined;
}

// MEM-28: /site/ and /shared/ names are stable across builds (MEM-25, MEM-26),
// so a page from another build would get this build's file for them from the
// cache. Its client is remembered here, and its non-hashed files bypass the
// cache (see the fetch handler). Resolves once the id is known in memory.
let networkClients = null;
function networkClientIds(cache) {
  if (!networkClients) {
    networkClients = cache.match(resolve(NETWORK_CLIENTS_PATH))
      .then((stored) => (stored ? stored.json() : []))
      .then((ids) => new Set(Array.isArray(ids) ? ids : []), () => new Set());
  }
  return networkClients;
}

async function rememberNetworkClient(cache, clientId) {
  if (!clientId) return;
  try {
    const ids = await networkClientIds(cache);
    ids.add(clientId);
    await cache.put(resolve(NETWORK_CLIENTS_PATH), new Response(JSON.stringify([...ids].slice(-NETWORK_CLIENTS_KEPT))));
  } catch {
    // A page the worker failed to remember gets this build's files, as before MEM-28.
  }
}

async function isNetworkClient(cache, clientId) {
  return !!clientId && (await networkClientIds(cache)).has(clientId);
}

// The one answer to "may this response be stored under this key in this
// build's cache": a key the manifest lists only with the bytes it names; any
// other key only when it is not a navigation (/_astro/ files are content-hashed
// and unlisted public files are not part of the precache set); with no readable
// manifest, the same.
async function mayStore(cache, key, response, { navigation = false } = {}) {
  const hashes = await hashesOfThisBuild(cache);
  const expected = hashes?.[key];
  if (!expected) return !navigation;
  try {
    return expected === await hashBytes(await response.clone().arrayBuffer());
  } catch {
    return false;
  }
}

// Resolves to the network's page and whether it is this build's (and so
// stored), or null without a network.
async function refreshNavigation(request, cache, cacheKey) {
  try {
    const response = await fetch(request);
    const ours = response.ok && await mayStore(cache, cacheKey, response, { navigation: true });
    if (ours) await cache.put(cacheKey, response.clone());
    return { response, ours };
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

// Mirrors the drafts handoff schema exactly (the DB name, store name and
// version in src/lib/drafts/draftIdb.ts, and the `handoff:<tool>` key prefix
// in src/lib/drafts/draftStore.ts) so the Sign tool's existing
// takeHandoff('sign') restore path - the same one FileDropzone's home-page
// drop already feeds - picks this up with no changes on that side. Duplicated
// rather than imported: this file is registered as a classic script (see
// BaseLayout.astro's `navigator.serviceWorker.register` call, no
// `{ type: 'module' }`), so it cannot `import` them. If that schema ever
// changes, this must change with it; draftStoreServiceWorkerSync.test.js
// fails until it does.
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
    // MEM-24: leave a reason for the page to report, then fail exactly as before. An error
    // with no reason is left unrecorded rather than reported under a wrong one.
    if (error instanceof InstallFailure) {
      await recordBounded(error.reason, '0');
      await releaseOlderBuild(error.reason);
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
        const cached = await servableFromCache(cache, cacheKey);
        if (cached) {
          event.waitUntil(refreshNavigation(request, cache, cacheKey));
          return cached;
        }
        const fresh = await refreshNavigation(request, cache, cacheKey);
        if (!fresh) return cache.match('/');
        // Remembered before the page is answered, so its first file request
        // finds it. A redirect is not a page: the browser asks again for its target.
        if (!fresh.ours && fresh.response.type !== 'opaqueredirect') await rememberNetworkClient(cache, event.resultingClientId);
        return fresh.response;
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
  //
  // MEM-28: a non-hashed file for a page from another build comes from the
  // network and is not stored; a content-hashed one is the same file in any build.
  // A worker that page starts is from that build too, and its requests carry
  // the worker's own client id.
  event.respondWith(caches.open(CACHE_VERSION).then(async (cache) => {
    if (await isNetworkClient(cache, event.clientId)) {
      await rememberNetworkClient(cache, event.resultingClientId);
      if (!isHashedUrl(url.pathname)) return fetch(request);
    }
    const cached = await cache.match(request.url);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      // The page gets the network response now; whether this build's cache
      // may keep it is decided on the clone, in the background.
      const copy = response.clone();
      event.waitUntil(mayStore(cache, url.pathname, copy)
        .then((ok) => (ok ? cache.put(request.url, copy) : undefined))
        .catch(() => {}));
    }
    return response;
  }));
});
