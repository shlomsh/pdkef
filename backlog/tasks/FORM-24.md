---
id: "FORM-24"
title: "One home for the ink edge builders"
status: "in_progress"
priority: "P3"
epic: "form-understanding"
phase: "near-term"
depends_on: ["ARCH-24"]
---

# FORM-24 · One home for the ink edge builders

## Why

`formGrid.js` (`verticalEdges`, `horizontalRules`, `ruledCoverage`) and `formCells.js`
(`verticalEdgesAll`, `horizontalRulesAll`, `ruledCoverage`) build the same edges from the same ink,
a deliberate duplicate noted in `formCells.js`, each with its own tolerance constants. They can
drift apart without any test noticing, and a strategy that wants edges has two to choose from.

## Acceptance

- [ ] One module exports parameterized edge and rule builders; both detectors use it. The
      differences that exist today (background-panel exclusion, rects folded in as edges) become
      parameters, not copies.
- [ ] Same tolerance values, now in one place.
- [ ] No behaviour change: `score-form.mjs --all` identical, both corpora green.

## Landed

New module `src/editor/adapters/pdf/inkEdges.js` exports `verticalEdges(ink, options)`,
`horizontalRules(ink, options)` and `ruledCoverage(rules, y, left, right, tolerance?)`. Both
`formGrid.js` and `formCells.js` import them; the two copies (`formCells.js`'s `verticalEdgesAll`,
`horizontalRulesAll`, and its own `ruledCoverage`) are deleted, and `formCells.js`'s header note was
updated to point at the shared module instead of describing a deliberate duplicate. `THIN_INK` (1.5)
and the coverage tolerance default (1.5) are declared once, in `inkEdges.js`.

Differences found before writing the module (both `1.5` in each file, so no value actually changed):

- **`verticalEdges` vs `formCells.js`'s old `verticalEdgesAll`**: identical fold (a thin rect -> one
  mid edge, a rect with real area -> two side walls), except `formCells.js` first skipped any rect
  `isBackgroundPanel` called a background panel (a large unstroked fill, its own `MAX_ROW_HEIGHT`
  tunable) and `formGrid.js` excluded nothing. Now the `excludeRect` predicate option; `formCells.js`
  passes `isBackgroundPanel` (kept local, since its threshold is formCells-specific), `formGrid.js`
  passes none.
- **`horizontalRules` vs the old `horizontalRulesAll`**: `formGrid.js` only ever folded a *thin* rect
  in as a rule. `formCells.js` additionally folded a full rect's own top and bottom in as two more
  rules, because `buildClosedCells` needs a filled box's edges to close a row the same way a ruled one
  does; `formGrid.js`'s comb "boxed" test never needed that. Now the `includeRectSides` option
  (`formCells.js`: `true`, `formGrid.js`: default `false`), plus the same `excludeRect` option as above.
- **`ruledCoverage`**: the two copies were byte-identical algorithms, differing only in which local
  constant supplied the y-tolerance (`formGrid.js`'s `BASELINE_TOLERANCE`, `formCells.js`'s
  `BAND_TOLERANCE`, both `1.5`, both used for other things in their own files so neither could just be
  deleted). Tolerance is now the function's 4th parameter, defaulting to `inkEdges.js`'s own
  `DEFAULT_COVERAGE_TOLERANCE` (1.5); both call sites pass their existing local constant explicitly,
  so a future change to one file's tolerance is a visible decision at its call site, not a silent
  change to the shared default. Sort order and dedupe (`distinctPositions`, `rowsByBaseline`,
  `runsFromTeeth`, `buildClosedCells`'s own walk) were untouched - only the edge/rule *inputs* they
  consume were unified, not the logic that consumes them.

`src/editor/adapters/pdf/inkEdges.test.js` (14 tests, new) pins each option: for `excludeRect` and
`includeRectSides`, every test asserts the option's default behaviour *and* the flipped behaviour, so
a test that ignored the option (always returning the default) would fail on the second assertion -
verified directly by calling the module with the option hard-removed and diffing the output. Same
pattern for `thinInk` (mutation-tested against the module output) and `ruledCoverage`'s `tolerance`.

Proof, all run locally: `node scripts/score-form.mjs --all` -> `0 changed, 10 unchanged, 0 regressed`
(exit 0); `npx vitest run src/editor/adapters/pdf` -> 476/476 across 16 files; `npx vitest run
src/editor/adapters/pdf/corpus` -> 195/195 across 2 files; `npm run typecheck` -> 0 errors. A stale
comment in `corpus/corpus.js` naming the old `horizontalRulesAll` by name was also updated to name the
new `includeRectSides` option instead (that file is not on the excluded-files list for this ticket).
