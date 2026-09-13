---
id: "QUAL-05"
title: "Shard the product e2e across two CI jobs, the last fixed-cost cut before affected-only tests"
status: "open"
priority: "P3"
epic: "module-boundaries"
phase: "quick-win"
depends_on: []
---

# QUAL-05 · Two shards for the product e2e

## Problem

After the 2026-09-13 CI work (parallel workers, font guards path-gated, docs-only skip, Vitest
without jsdom where it is not needed, the perf budgets alone on one worker) a typical run on `main`
is about 3:20 wall, and the critical path is the `build` job: `npm ci` 9s, build 9s, dist guards
about 15s, browser install about 40s, product e2e 1:45 to 2:10 on two workers, perf budgets 12s.
The product e2e is shared-code heavy, so gating it per tool waits for ARCH-20; halving it by
sharding is available now and needs no knowledge of the code.

## Scope

- Turn the `build` job's product e2e into a two-entry matrix running
  `npx playwright test --project=chromium --project=webkit --shard=1/2` and `--shard=2/2`. Each shard
  pays the fixed cost again (about 70s), so the expected critical path is about 2:20 instead of 3:20;
  measure it on five runs and record the numbers here. If the saving is under 40s, close this as
  not worth two runners.
- The dist guards run once, in the first shard only, or in their own job; do not run them twice.
- Keep the `perf` project on one worker in one shard.
- Blob-report merge is not needed unless the HTML report matters on failure; the `list` reporter
  per shard is enough.

## Acceptance

- Five green runs with the shard matrix, median wall time recorded against the five before it.
- The same 134 product tests (chromium 113, webkit 21) run across the shards (sum the "passed"
  counts); the 276 total also counts the 137 font guards and 5 perf budgets, which are not sharded.

## Notes

Implemented as a single `build` job (npm ci, build, dist guards: csp/seo/redirects/css/weight,
then uploads `dist/` as an artifact) plus a new `e2e` job, `needs: [scope, build]`, matrixed on
`shard: [1, 2]` with `fail-fast: false`. Each shard entry does its own checkout + npm ci (`src/`
imports in the font parity/shaping specs come from the checkout, not the artifact), downloads
`dist/`, installs both browsers, and runs
`npx playwright test --project=chromium --project=webkit --shard=<n>/2`; shard 1 additionally
runs `npx playwright test --project=perf --workers=1`. Chose the download-dist shape over
rebuilding per shard: `playwright.config.js`'s `webServer` runs `astro preview` against `dist/`
on disk with no other runtime input, so a downloaded `dist/` (51 MB locally) is sufficient and
avoids paying the ~9s build cost twice. Dist guards (test:csp/seo/redirects/css/weight)
still run exactly once, unchanged from before this ticket.

Local `--list` proof (no server needed, current chromium+webkit suite, `perf`/`fonts` excluded
by their own projects):

- `--project=chromium --project=webkit --list`: 134 tests in 36 files
- `--shard=1/2 --list`: 67 tests in 25 files
- `--shard=2/2 --list`: 67 tests in 14 files
- 67 + 67 = 134, matches the unsharded total; the two shards partition the chromium+webkit set
  exactly.

Guard scripts all pass on this branch: `npm run test:dependency-governance` ("Dependency
governance dry-run passed"), `npm run check:guidance` ("Guidance budget OK: CLAUDE.md 154/200
lines"), `npm run check:backlog` ("Backlog valid: 148 task files, BACKLOG.md and TODO.md
current"). Status left as `open`; the five-run wall-time measurement on `main` is still
outstanding.
