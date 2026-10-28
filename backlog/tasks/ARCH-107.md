---
id: "ARCH-107"
title: "draftStore.ts and formCells.js are split by responsibility"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-107 · draftStore.ts and formCells.js are split by responsibility

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding S7.
Area: Code. Criterion: Size and complexity. Structure only: no behaviour change.

## Why

- `src/lib/drafts/draftStore.ts` is 1,154 lines and `src/tools/sign/lib/fields/formCells.js` is 1,061, both outside the islands.

## Outcome

- Each file split by responsibility.
- The ratchet records lowered.

## Acceptance

- [x] Neither file is over 800 lines.
- [x] The size record shows the lower values.

## Done (2026-10-28)

- `src/lib/drafts/draftStore.ts` 1,154 -> 705 lines: its IndexedDB plumbing (`draftIdb.ts`), change events
  (`draftChanges.ts`), recents index (`draftRecentIndex.ts`), source ids (`draftSourceId.ts`) and legacy migration
  (`draftMigration.ts`) are their own modules, each with a test. `draftStore.ts` stays the one entry point and
  re-exports six names from two of them: ten test files mock `draftStore.ts` whole, so moving importers would
  change what those mocks cover.
- `src/tools/sign/lib/fields/formCells.js` 1,061 -> 657 lines: the ruled-grid walk is `formCellGrid.ts`. It is on
  the detection-purity list, and a new test keeps that list closed under imports from the detection folder (it
  also found four detection modules the guard had missed: confidenceWeights, formLeaders, combTitleLine, pageKind).
- Both size records are dropped. Moved code is verbatim apart from imports, and for formCellGrid, types.
