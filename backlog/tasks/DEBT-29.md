---
id: "DEBT-29"
title: "formCells.js: one cell-box helper, and detectCellCandidates split into one resolver per branch"
status: "done"
priority: "P3"
epic: "robustness"
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

## Done (2026-10-02)

- `cellBox` / `tickBoxCell` replace the four repeated cell-to-percent-box conversions and the
  `resolved.push({...})` literals; `centreY` in `fieldOrder.ts` is inlined.
- `detectCellCandidates`' first pass is an ordered list of per-branch resolvers (`resolveFloorTicked`,
  `resolveNarrowTick`, `resolveLoneSquare`, `resolveLoneBox`, `resolveGeneralCell`), 175 lines down to 77.
  A resolver answers `undefined` (not my cell, ask the next), `null` (mine, and dropped) or the resolved
  cell; a plain `null` for "ask the next" would have let a rejected narrow or lone cell fall into the
  general path, which is a behaviour change. 19 tests in `formCellResolvers.test.js`, two sabotage-checked.
- `buildClosedCells` is a short pipeline over `findBands`, `columnsBetween` and `applyFloorTicks` (135
  lines down to 14, with `vetoRules`, `closedColumn` and the rise/span helpers as top-level functions).
  18 tests in `formCellColumns.test.js`, two sabotage-checked. The file grew from 851 to 1,045 lines
  because every extracted function carries its own JSDoc types.
- **Oracle, stronger than the KPIs:** a temporary test dumped every detected cell for every corpus form
  (316,119 bytes of JSON) from the untouched code and from each step. All three steps are byte-identical,
  so recall and precision are identical by construction. The test was not committed.
- Checks: field and text unit tests 1,335 green, `test:detection-purity`, `test:module-boundaries` and
  `check:fast` green.
