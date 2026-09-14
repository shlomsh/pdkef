---
id: "QUAL-09"
title: "A webkit-only e2e job, so the chromium shards stop paying 51s to install a browser they do not run"
status: "in_progress"
priority: "P2"
epic: "module-boundaries"
phase: "quick-win"
depends_on: ["QUAL-06"]
---

# QUAL-09 · Install webkit once, on the job that runs it

*Filed 2026-09-14*, finding 6 of
[docs/architecture-debt-review-2026-09-14.md](../../docs/architecture-debt-review-2026-09-14.md).

## Problem

Measured on run 34788031094: `e2e (1)` is 167s, of which `playwright install --with-deps chromium
webkit` is 51s, for 21 webkit tests that would take about 32s on one runner. Both shards pay it. The
chromium-only fonts job installs its browser in 12-15s. After QUAL-06 the `e2e` shards are the wall.

## Scope

- Third job (or a third matrix leg) `e2e-webkit`: `npm ci`, build, `playwright install --with-deps
  webkit`, `npx playwright test --project=webkit --pass-with-no-tests $E2E_PATHS`, plus the perf
  budgets on one worker (moved out of shard 1). Same `Resolve affected scope` step as the others.
- The two chromium shards install `chromium` only and run `--project=chromium --shard=N/2`.
- Header comment in `ci.yml` and the `e2e` paragraph in `docs/nx-affected-ci.md` updated.

## Acceptance

- Five green `everything` runs: each chromium shard under 100s, the webkit job under 120s, the run's
  wall no longer set by an `e2e` job (compare against `font-guards` after QUAL-06 and `checks`).
- `npx playwright test --list` across the three commands still sums to the product total (139 at filing).
