---
id: "MEM-22"
title: "A build's cache holds only that build's files"
status: "done"
priority: "P3"
epic: "robustness"
depends_on: []
---

# MEM-22 · A build's cache holds only that build's files

*Filed 2026-10-27* from the fresh review of MEM-15..18. Both paths predate that work.

## Why

- `loadManifest` (`public/sw.js:191`) fetches the live `/precache-manifest.json`. When a second deploy
  lands while a waiting worker is still completing its precache (`completePrecache`), that worker's cache
  is filled from the newer build's file list and then marked complete.
- `refreshNavigation` (`public/sw.js:434`) writes the server's current HTML into the running build's
  cache, so a cached page can come from a newer build than the scripts beside it.

## Outcome

- A worker precaches from the manifest of its own build, identified by the build id it carries, and stops
  rather than mixing when the served manifest belongs to another build.
- A background navigation refresh stores a page only when it belongs to the cache's build.

## Acceptance

- [x] Unit tests in `scripts/sw.test.mjs` for both paths: a manifest from another build is not used, and
      a refreshed page from another build is not stored.
- [x] `e2e/offline/` stays green.

## Done

*2026-10-27.* The precache manifest names its build and the bytes of every file the build serves
unhashed: `build` is the id stamped into `sw.js`, and `hashes` maps every precached URL outside
`/_astro/` (the pages, `/`, icons, wasm, the web manifest) and every `/fonts/*.ttf` a font pack can
fetch to the first 16 hex characters of its SHA-256 (`scripts/pageHash.mjs`). The generator writes the
manifest last, so the hashes are of the final bytes.

- **Path 1.** A worker rejects a manifest whose `build` is not its own: install fails, and a waiting
  worker's `completePrecache` stops without marking itself complete. During install, a fetched file
  whose bytes do not match its hash counts as missed (`/` fails the install), so a deploy landing
  mid-install cannot fill the cache with the newer build's files.
- **Path 2.** The worker keeps its own manifest in its cache (`/__pdkef/manifest/`). Every runtime
  write goes through one rule, `mayStore`: a listed URL is stored only with the bytes its hash names; a
  navigation the build does not list is not stored; any other unlisted asset is stored as before
  (`/_astro/` files are content-hashed). It covers the background navigation refresh, the cache-first
  asset branch and font-pack provisioning and migration.
- **Guard.** `test:precache-budget` fails when `build` is missing from `sw.js`, when `hashes` misses a
  served unhashed file or font, or when a hash differs from the file in `dist/`, so a later step that
  rewrites HTML after the manifest cannot silently stop pages from being stored.
- `e2e/offline/twoBuildServer.js` serves hashes for the bytes it actually sends, so the update e2e runs
  the real check. The manifest grew from 72.9 KB to 80.5 KB.

