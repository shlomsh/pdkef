---
id: "DEBT-29"
title: "formCells.js: one cell-box helper, and detectCellCandidates split into one resolver per branch"
status: "in_progress"
priority: "P3"
epic: "robustness"
horizon: "later"
depends_on: []
---

# DEBT-29 · formCells.js: one cell-box helper, and detectCellCandidates split into one resolver per branch

*Filed 2026-10-01* from DEBT-15's comment pass, which was comments-only by design and listed the
code smells it found instead of touching them.

## Problem

`src/tools/sign/fields/formCells.js` (about 1,050 lines) is the one file in the field-placement set
whose size comes from code, not comments:

- About four near-identical `toPagePercentBox(geometry, { x0, y0, x1, y1 })` conversions of a cell,
  plus the `resolved.push({ ... })` literals in `detectCellCandidates`. One `cellBox(cell)` helper
  collapses them.
- `detectCellCandidates` is about 250 lines with five early-`continue` branches (floor-ticked, narrow,
  square, lone, general). Each branch is its own resolver: a pure function from a candidate to a
  resolved cell or nothing, tried in order.
- `buildClosedCells` is deeply nested and closure-heavy; `columnsBetween` and the tick handling
  extract cleanly.

Smaller, in `src/editor/text/fieldOrder.ts`: `centreY(field)` wraps `centreYOfBox(field.region)` and is
used once.

## Scope

A refactor with no behaviour change. The field-detection corpus (`scoring.test.js`, the scored KPIs)
and the unit tests are the oracle and must be unchanged; `test:detection-purity` stays green.

## Acceptance

- The scored corpus reports identical recall and precision for every form, before and after.
- `detectCellCandidates` reads as an ordered list of resolvers, each unit-tested on its own branch.
