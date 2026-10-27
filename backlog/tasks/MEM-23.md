---
id: "MEM-23"
title: "Each precache request has a time limit"
status: "in_progress"
priority: "P3"
epic: "robustness"
horizon: "later"
depends_on: []
---

# MEM-23 · Each precache request has a time limit

*Filed 2026-10-27* from the fresh review of MEM-15..18. The behaviour predates that work.

## Why

- `precacheUrls` in `public/sw.js` runs at most `PRECACHE_CONCURRENCY` (six) requests at a time with no
  per-request timeout. Six stalled requests hold every lane, so an install can stay in `installing`
  indefinitely on a flaky connection.

## Outcome

- Each precache fetch is aborted after a fixed limit and counted as missed, like any other failed URL
  (the per-URL tolerance already handles misses; only `/` fails the install).

## Acceptance

- [ ] Unit test: a fetch that never settles is aborted after the limit, the URL is reported missed, and
      the remaining URLs still precache.
