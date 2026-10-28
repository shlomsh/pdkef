---
id: "QUAL-39"
title: "Unit tests run in two parallel CI jobs"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "now"
depends_on: []
---

# QUAL-39 · Unit tests run in two parallel CI jobs

*Filed 2026-10-28* from the CI and build-structure assessment of 2026-10-27: a replay of the scope verdict on 58 consecutive pushes to main, job timings from 24 CI runs (2026-10-26/27), and `check:fast`/`check:push` timed on typical diffs. Lane: [ARCH-123](ARCH-123.md).

## Why

- `units` took 154 to 300 s across the 24 runs and is the long pole of narrowed runs: run 40581266228
  ended on `units` at 300 s. About 155 s of that is tests and about 35 s is setup.

## Outcome

- `units` runs as two `vitest --shard` jobs, so a narrowed run's wall drops by about 60 to 70 s.

## Acceptance

- [x] Both halves together run the same test files as today (a check in the job, or a test).
- [ ] `units` wall time from three narrowed runs recorded in the ticket.

## Progress (2026-10-28)

- `units` is a two-shard matrix (`vitest run --shard=i/2`, `fail-fast: false`). `scripts/check-unit-shards.mjs`
  (`npm run check:unit-shards`, in the CI `checks` job and `check:push`) lists the files vitest would run in full and
  per shard through vitest's node API and fails unless the shards cover them exactly once. `vitest list --shard`
  ignores the flag, so the CLI could not be used.
- Before: `units` took 214 to 291 s on the last wide runs (40736175265, 40731441511, 40731088174, 40726898541,
  40724286548, 40716281658, 40664805926).
- Open: the second box, `units` wall time from three narrowed runs after landing.
