---
id: "MEM-13"
title: "A build that fixes a major bug can force every open tab onto it"
status: "done"
priority: "P1"
epic: "robustness"
depends_on: []
---

# MEM-13 · A build that fixes a major bug can force every open tab onto it

*Filed 2026-10-01* by Shlomi, after MEM-10. MEM-10 made every update silent and safe: a waiting
build takes over on a navigation, only when no tab holds work a reload would lose. That is right for
ordinary builds and stays exactly as it is. It leaves one case open: a fix for a major bug (data
loss) still waits behind a tab that keeps a file open in Compress, or a tab nobody navigates in. For
that build we want to force it, and we used to be able to.

## The mechanism we are reviving

`public/sw.js` once carried a hand-bumped `CACHE_VERSION` (`pdfmerge-v1` .. `pdkef-v3`, last bumped
2026-07-06 "force cache purge for GA deploy"), later replaced by the content-hashed `__BUILD_ID__`.
It comes back as one integer, `CRITICAL_VERSION`, bumped by hand only for a build that must reach
everyone now.

## Decision (2026-10-01)

- **Must keep:** the MEM-10 service-worker design, unchanged for every build that does not bump
  `CRITICAL_VERSION`: precache, offline, the silent takeover on a navigation, `skipWaiting()` never on
  install.
- **Silent offline.** A forced update happens only when the waiting build is fully precached and the
  device is online (`readyToTakeOver()`), the same gate MEM-10 uses. Offline nothing happens and
  nothing shows; the old build keeps working, and the force resumes when the device is back online.
- **What a force overrides:** a file open in a tool without drafts, and a tab that does not answer.
  What it still waits for: an export in flight, up to a cap, and the flush of pending draft saves.

## Contract (both sides build to this)

**Service worker (`public/sw.js`)**

- `const CRITICAL_VERSION = 0;` near `CACHE_VERSION`. The cache name becomes
  `` `${CACHE_PREFIX}c${CRITICAL_VERSION}-__BUILD_ID__` ``. A pure `criticalVersionOf(cacheKey)` reads it
  back; a key without the `c<N>-` segment (every build before this ticket) is 0, so shipping this
  ticket at 0 forces nobody.
- A pure `isCriticalOver(ownVersion, otherKeys)`: true when `ownVersion` is greater than the highest
  critical version among the other own caches.
- `tryForcedTakeover()` in the waiting worker, single-flight (a module-level promise). It runs at the
  end of install, and on the `pdkef:critical-check` message. Steps: return unless this worker is
  `self.registration.waiting`, `isCriticalOver(...)` and `readyToTakeOver()` (online and fully
  precached); post `{ type: 'pdkef:critical-update' }` with a MessagePort to every page window
  (`surveyWindows`'s filter); wait until every window replied `{ ready: true }` or
  `CRITICAL_TAKEOVER_CAP_MS = 75_000` passed; then `self.skipWaiting()`. The existing
  `controllerchange` reload in every page does the rest.
- Never touches the MEM-10 paths for a non-critical build. `skipWaiting()` still never runs on
  install unconditionally.

**Page (`src/site-lib/appUpdate.ts`, `src/lib/appUpdate/updateHolds.ts`)**

- On `pdkef:critical-update`: show the update line in every tab, the force variant: "An important fix
  for PDkef is ready. This page reloads in a moment." (localized like the MEM-10 lines). Flush pending
  draft saves, then wait while this tab has an export in flight, at most `CRITICAL_PAGE_CAP_MS =
  60_000`, then reply `{ ready: true }`. A file open in a draftless tool does not hold a force.
- Discovery, so a tab nobody navigates in still learns about a new build: call
  `registration.update()` when the tab becomes visible, on `online`, and once an hour while open.
  After each, if `registration.waiting` exists, post `{ type: 'pdkef:critical-check' }` to it. Errors
  are swallowed with `// expected:` (offline, a fetch failure): never a console error, never a line.

## Review decisions (2026-10-01)

From a fresh review of the first build of this contract:

- **A force that falls through is abandoned, not stuck.** If no takeover follows within
  `CRITICAL_ABANDON_MS = 90_000` of the ask (the device went offline, the build stopped being ready, the
  worker was stopped), the tab leaves the critical line and returns to MEM-10's behaviour; the next ask
  starts fresh, with a new draft flush and export wait.
- **A failed draft save is an `open` hold, not an `export` one.** It holds an ordinary update as before,
  but it cannot resolve within a force's wait, so it does not delay one.
- **The worker's cap is 75s**, leaving margin over the page's 60s cap plus its draft flush.
- **First bump, legacy tabs.** A tab still running code from before this ticket cannot answer a force;
  the worker goes ahead at its cap, and that tab reloads once its own holds release. Written into the
  rule.
- The visible-tab update check is every 60s at most (was 30 minutes), and coming online checks at once.
  Each check is one conditional request for `sw.js`.

## Acceptance

- Unit: `criticalVersionOf`, `isCriticalOver` (including old keys as 0), the page's force handler
  (flush, export wait, cap, reply) and the discovery triggers.
- e2e, extending `e2e/offline/app-update.spec.js`: two tabs on an old build, one holding a file in
  Compress; a new build with `CRITICAL_VERSION` bumped; both tabs land on the new build with no
  navigation. Offline: the same deploy does nothing and shows nothing until back online. A build that
  does not bump it behaves exactly as MEM-10's specs say (they stay green).
- `.claude/rules/csp-scripts-pwa.md` says how and when to bump `CRITICAL_VERSION`.

## Done (2026-10-01)

- `public/sw.js`: `CRITICAL_VERSION` (ships at 0) in the cache name, pure `criticalVersionOf` /
  `isCriticalOver` (compared against the lowest other build cache, so a leftover newer waiting cache
  cannot hide an old tab), single-flight `tryForcedTakeover` gated on waiting + over + fully precached
  and online, re-checked after its 75s wait.
- Page (`src/site-lib/appUpdate.ts`): the critical line in every tab, draft flush, an export holds up to
  60s, abandon after 90s with no takeover; discovery on visible (60s throttle), online and hourly; a
  newly installed build is nudged at once. Tools without drafts hold as `open`, which only an
  ordinary update waits for; a failed draft save is `open` too.
- Fresh review: no change for non-critical builds, no way to force when it should not; its three
  findings are fixed (see Review decisions).
- e2e (`e2e/offline/app-update.spec.js`): a critical build reaches two tabs, one holding a file in
  Compress, with no navigation; offline nothing happens until back online. 7/7 three runs in a row.
  `check:push` green, 298 e2e passed.
- Hebrew line awaits Shlomi's native read: "תיקון חשוב ל-PDkef מוכן. העמוד הזה ייטען מחדש בעוד רגע."
