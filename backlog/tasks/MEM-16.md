---
id: "MEM-16"
title: "A new build's cache carries every unchanged content-hashed file over from the previous cache"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "now"
order: 1
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
