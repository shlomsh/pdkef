---
id: "MEM-22"
title: "A build's cache holds only that build's files"
status: "in_progress"
priority: "P3"
epic: "robustness"
horizon: "later"
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

- [ ] Unit tests in `scripts/sw.test.mjs` for both paths: a manifest from another build is not used, and
      a refreshed page from another build is not stored.
- [ ] `e2e/offline/` stays green.
