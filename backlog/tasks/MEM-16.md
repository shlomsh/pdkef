---
id: "MEM-16"
title: "A new build's cache carries every unchanged content-hashed file over from the previous cache"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# MEM-16 · A new build's cache carries every unchanged content-hashed file over from the previous cache

*Filed 2026-10-27* from a loading measurement of origin/main. The redeploy cost below is read from
`public/sw.js`, not measured.

## Why

- Each build installs into a fresh cache: `CACHE_VERSION` includes `__BUILD_ID__` (`public/sw.js:44`).
- The install fetches every manifest URL with `cache: 'reload'` (`fetchFresh`, `public/sw.js:161`),
  which skips the HTTP cache, and `skipCached` only looks in the new, empty cache
  (`precacheAppShell`, `public/sw.js:192`).
- On activate, only font packs move to the new cache (`migrateFontPacks`, `public/sw.js:561`); the
  previous caches are then deleted.
- So a returning visitor re-downloads the whole precache, about 5.2 MB today, after every deploy, even
  though `/_astro/*` files are content-hashed and never change under the same URL. main takes dozens of
  pushes a day.

## Outcome

- Install plans its work as a pure function: given the new manifest and the URLs held by the previous own
  caches, it returns what to copy and what to fetch. Content-hashed URLs present in a previous cache are
  copied; HTML, the manifest and any unhashed URL are always fetched fresh.
- The copy happens during install, before activate deletes the old caches, so MEM-10's waiting and
  takeover order is unchanged.

## Acceptance

- [ ] Unit test: two manifests that share N hashed URLs plan exactly the differing ones for fetch.
- [ ] A scripted two-build run (build, visit, rebuild with one source change, revisit) records the bytes
      the second install downloads, before and after this change, in the Done section.
- [ ] `e2e/offline/app-update.spec.js` and the "draft survives an app-cache upgrade" case in
      `e2e/offline/offline-workflows.spec.js` stay green.

## Done (2026-10-27)

- `public/sw.js`: a URL is content-hashed when its path starts with `/_astro/`. The pure
  `planPrecache(urls, previouslyCached)` returns `{copy, fetch}`; install copies hashed URLs from the
  previous own caches before activate deletes them. Everything else is fetched with `cache: 'no-cache'`
  (validated with the server, a 304 when unchanged) instead of `'reload'`. Unit tests in
  `scripts/sw.test.mjs` cover the plan, a copy with no network and the cache modes.
- Two-build run (whole-app install, persistent profile, visit /redact/ on build 1, rebuild with one line
  added to `PdfRedactTool.tsx`, revisit), the new worker's traffic until its cache was complete:
  - Before: every deploy re-downloaded the whole precache, 268 requests and 5,202,979 wire bytes (the
    old install fetched every URL with `cache: 'reload'`; equal to the measured first install).
  - After, server with ETags (as Vercel sends): 71 requests, 54,681 bytes. 114 hashed files copied, the
    one changed chunk fetched (34,980), 67 non-hashed URLs answered 304, `/about/` 200 (11,992).
  - After, server without validators: 71 requests, 2,402,835 bytes, all non-hashed URLs downloaded again.
- `e2e/offline/app-update.spec.js` and the "draft survives an app-cache upgrade" case green.
