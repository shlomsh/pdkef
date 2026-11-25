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

## Status

- `check:fast` leaves the browser project out (`runUnitByImpact`, test seen failing first).
