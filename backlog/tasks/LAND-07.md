---
id: "LAND-07"
title: "Expected values live in the case table, wall-clock bounds are deliberate, silent catches say why"
status: "open"
priority: "P2"
epic: "honest-tests"
horizon: "now"
depends_on: ["LAND-06"]
---

# LAND-07 · Expected values live in the case table, wall-clock bounds are deliberate, silent catches say why

*Filed 2026-11-27.* Three small rules from landmines 0.3.2, about 35 sites in all
(docs/landmines-adoption.md):

- `no-parameter-branch`, 7 sites in 6 files. The test body computes its expected value from the case
  (`rotation % 180 === 0 ? 200 : 300` in `src/editor/geometry/coords.test.js:100`,
  `importAnnotations.test.ts:364`, `affected-scope.test.mjs:1113`), so it mirrors the code under test
  instead of checking it.
- `no-elapsed-time-bound`, 6 sites. An upper bound on wall-clock time fails on a slow machine with no bug.
  `src/tools/redact/lib/documentTraces.test.js:309` (50,000 unclosed XMP packets under 500 ms) can assert
  the work done instead; the deliberate budgets (`RENDERS_WITHIN_MS`, the throttled mobile-cost bar in
  `compare-preview.spec.js:69`) keep a disable line naming the budget.
- `no-silent-catch`, about 20 sites in 17 files. Best-effort cleanups and beacons
  (`useDeletePreviews.ts:68`, `DriveLink.tsx:21`) that already say why in a comment.

## Outcome

- Each `no-parameter-branch` case carries its expected value in the `test.each` table.
- Each wall-clock bound either becomes a work-count assertion or keeps a one-line
  `oxlint-disable-next-line landmines/no-elapsed-time-bound -- <the budget>`.
- Each silent catch either handles the rejection or keeps a one-line disable whose reason is the comment
  it already carries. A catch that hides a real failure is fixed, test first.
- The three rules at `error` in `.oxlintrc.json`, `npm run lint:landmines` clean.
