---
id: "QUAL-57"
title: "check:fast never starts a browser, and CI says when it slows down"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# QUAL-57 · check:fast never starts a browser, and CI says when it slows down

*Filed 2026-11-25.* Since LAND-04 landed, `vitest related` also picks browser test files, so a one-file edit
in the shell or Scan started Chromium in every subagent's `check:fast`.

## Measured, one-file edits, before and after LAND-04

`src/shell/BasePdfTool.tsx` 18.4s to 61.6s (13 browser files), `src/tools/scan/lib/scanPages.ts` 3.6s to 31.7s (11),
`src/tools/redact/hooks/useRedactDrawing.ts` 5.6s to 12.4s (1). Merge and Compress got faster.

## Outcome

- `check:fast` runs no browser test. `check:push` runs those the diff reaches, and no Playwright spec (Shlomi's call,
  2026-11-25); CI runs all of them, and the long e2e runs only there.
- `check:push` stays fast: its time on an idle machine is recorded here for a tool, a shell and a lib edit.
- Time guards on CI: counts fail, seconds are reported (a shared runner is too noisy to fail on), and every job has a
  `timeout-minutes`.

## Local times, 2026-11-25, one run each, seconds, before LAND-04 and now

| One-file edit | `check:fast` | `check:push` |
| --- | --- | --- |
| Merge hook | 39 to 28 | 47 to 52 |
| Shell (`BasePdfTool`) | 29 to 24 | 46 to 71 |
| Lib (`errorReport`) | 46 to 51 | 56 to 100 |

`check:push` grew with the browser tests it reaches: its unit step went from 19 to 51 (shell) and from 35 to 79 (lib).

## Status

- `check:fast` leaves the browser project out (`runUnitByImpact`, test seen failing first).
- CI waits less: four unit shards, the browser tests in two, chromium e2e shards split by recorded time
  (`scripts/e2e-shard-plan.mjs`), and `plan` beside `scope`. Wide runs took 367 and 380 s of wall time before
  (45592513889, 45587745808) and 302, 305 and 307 s after (45609749444, 45607925164, 45621050714).
- The guards of `check:fast` take 2.9 s, were 12.5 s; `check:push` runs its guards three at a time.
- Every job has a `timeout-minutes`, and the browser test count cannot grow (`browserTests` in
  `scripts/ratchet-limits.json`).

## Local times after, 2026-11-25, quiet machine, seconds, before the two checks were reworked (399b654ba) and at e6c2e188b

| One-file edit | `check:fast` | `check:push` |
| --- | --- | --- |
| Merge hook | 20 to 11 | 46 to 40 |
| Shell (`BasePdfTool`) | 28 to 17 | 77 to 43 |
| Lib (`errorReport`) | 54 to 42 | 118 to 65 |

One run each; the lib row's 118 is from an earlier round, as this round's old run stopped at a unit flake fixed since. An edit
to `vitest.config.js` still runs the whole suite (213 s).

## Open

- Seconds are not reported on CI yet. Shlomi has not decided on a time guard for counts and spread.
- `e2e-spec-seconds.json` is refreshed by hand; its entry for `launcher-picker-pinned` is now low.
