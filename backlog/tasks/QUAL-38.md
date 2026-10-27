---
id: "QUAL-38"
title: "The four chromium e2e shards finish within 20 s of each other"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# QUAL-38 · The four chromium e2e shards finish within 20 s of each other

*Filed 2026-10-28* from the CI and build-structure assessment of 2026-10-27: a replay of the scope verdict on 58 consecutive pushes to main, job timings from 24 CI runs (2026-10-26/27), and `check:fast`/`check:push` timed on typical diffs. Lane: [ARCH-123](ARCH-123.md).

## Why

- `--shard=N/4` divides by test count, not time. On run 40587630988 the Playwright step took 166, 100,
  178 and 217 s on shards 1 to 4. The slowest shard sets the wall of 68% of non-docs pushes (the full
  runs).
- `playwright.config.js:70-83` already balances the two font-guard shards by hand-listed files with a
  complement shard, so no spec can be dropped.

## Outcome

- The chromium shards are balanced the same way, by measured time with a complement shard, and a full
  run's slowest shard drops from about 217 s to about 165 s.

## Acceptance

- [ ] A test proving every product spec lands in exactly one shard.
- [ ] Shard times from three full runs recorded in the ticket, within 20 s of each other.
