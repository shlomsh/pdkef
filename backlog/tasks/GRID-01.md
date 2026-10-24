---
id: "GRID-01"
title: "Merge's page grid moves to src/shell as the shared page grid, nothing visible changes"
status: "done"
priority: "P1"
epic: "polish"
depends_on: []
---

# GRID-01 · Merge's page grid moves to src/shell as the shared page grid

Design: [docs/shared-page-grid.md](../../docs/shared-page-grid.md) (the contract section is the spec).

- `src/lib/pagePlan.ts`: `PlanEntry`, `planForFile`, `moveEntry`, `updateEntry`, `rotateEntry`,
  `outputPageCount`, with their unit tests, out of `src/tools/merge/mergePlan.ts`.
- `src/shell/pageGrid/`: `PageGrid.tsx` + `.module.css` from `PageStrip`, and `stageFit.ts` /
  `useStageFit.ts` from `src/tools/merge/`, with their tests. The `labelSources` prop gates captions,
  tags and the band. Merge-only visuals driven by the rail stay in Merge's CSS over the cell's data
  attributes.
- `PageGridMessages` in `src/i18n/toolMessages`, which `MergeMessages` extends.
- `onRegisterUndo` stays for now; GRID-03 removes it.

## Acceptance

- Merge's unit tests and every `src/tools/merge/e2e/` spec pass unchanged in what they assert.
- `test:module-boundaries` reports nothing but rule 9 for the moved modules, and nothing in `src/shell/`
  or `src/lib/` imports a tool. Rule 9 (a common-layer module needs two consumers, no exceptions) only
  holds once Edit Pages consumes them, so GRID-01 to GRID-04 land on main in one push.

## Outcome (2026-10-24)

Done. `src/lib/pagePlan.ts` and `src/shell/pageGrid/` (PageGrid, stage fit, FileName); `labelSources`
gates file labels; Merge-only rail visuals stay in Merge's CSS over `data-page-grid` hooks. Merge e2e
49/49 on a production build right after the move.
