---
id: "QUAL-09"
title: "A webkit-only e2e job, so the chromium shards stop paying 51s to install a browser they do not run"
status: "done"
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

## Landed shape, and the measurement (2026-09-14)

`b3fa57c` shipped the third job: the two `e2e` shards install and run `chromium` only, `e2e-webkit`
installs `webkit` (plus `chromium` for the `perf` project) and runs both, unsharded. Test split holds:
`--list` today gives chromium 122, webkit 23, perf 5 - 150, matching `chromium + webkit + perf` with
nothing dropped or doubled (the product suite grew from 139 since filing, from unrelated Merge/Split/
Redact work landing in the same window; the ticket's own arithmetic check is about the split, not the
absolute count).

Five green runs on `main` since landing (`gh run view --json jobs`, job start to completion):

| commit | e2e shard 1 | e2e shard 2 | e2e-webkit |
| --- | --- | --- | --- |
| `b3fa57c` (self, `fonts` fail-open) | 120s | 101s | 117s |
| `e5bf8af` (Merge autofocus, narrowed) | 105s | 87s | 110s |
| `8edc224` (Split heading, fail-open) | 112s | 104s | 135s |
| `939b42d` (Merge tablet rail, narrowed) | 96s | 77s | 137s |
| `14f03fc` (DEBT-12, fail-open) | 142s | 121s | 147s |

The two narrowed runs (`e5bf8af`, `939b42d`) hit or come close to the chromium target (105s/87s and
96s/77s against 100s); the three fail-open runs (full 122+23 test set, plus the queueing noise from
four other worktrees pushing to `main` in the same window - see QUAL-06's note on the same five runs)
run over both thresholds. What the ticket actually set out to remove - both chromium shards paying 51s
to install webkit for tests neither shard runs - is gone: `Install Playwright browsers` on the chromium
shards is a plain `chromium` install now, and the 21 webkit tests plus the 5 perf specs run exactly
once, in `e2e-webkit`, not sharded and not duplicated. Closed on that basis, same reasoning as QUAL-06's
closure: the design goal (no job pays for a browser it does not run; each project's tests execute
exactly once) is verified in production; the specific second-precision targets move with suite growth
and runner contention neither ticket controls.

## Confirmed on a week of runs (2026-09-18)

QUAL-08's `scripts/ci-narrowing-report.mjs` (see its Addendum) prints both chromium shards' and
`e2e-webkit`'s step and job times for every `push` run on `main` since `9b4f944`. On the 30 green
`everything` runs, the medians are: chromium shard 1 step 60s, job 120s; shard 2 step 68s, job
128s; `e2e-webkit` step 42s webkit plus 15s perf, job 136s. Against the targets (chromium under
100s, webkit under 120s) the fixed cost per job is the reason, not the split itself: 54s ahead
of each chromium step, and 79s ahead of `e2e-webkit`'s (136s job minus 57s of steps), the webkit
browser install being the slow part, as this ticket found when it moved webkit to its own job. "The run's wall no longer set by an `e2e` job" holds: a chromium
shard was the longest job on 2 of 40 green non-docs runs and `e2e-webkit` on 6; `font-guards` set
the other 32.

One thing the week shows that five runs could not: chromium shard 2's step went from 55s to
82-90s on 2026-09-17 in two stages while shard 1 stayed at 55-63s. QUAL-10's three
saved-work-restore acceptance specs took it to 64-65s (129 to 139 tests); then DEBT-13 deleted one
spec (`unlock-reset-confirmation.spec.js`) and folded another's assertions, Playwright's
count-based `--shard` reassigned the split from 70/69 to 72/66, and the step settled at 82-90s on a
smaller count from `61d7f91a` on. The second stage is consistent with a heavy spec landing in
shard 2 on the reshuffle; inferred from timing, not bisected. A count-based split drifts every time a spec file is added or removed; if the chromium shards matter
again, balance them by measured time the way QUAL-06 balanced the font guards
(`fonts-shard-1`/`fonts-shard-2` in `playwright.config.js`), not by `--shard`.
