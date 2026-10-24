---
id: "GRID-04"
title: "Edit Pages shows its pages through the shared grid, layout and undo, identical to Merge"
status: "open"
priority: "P1"
epic: "polish"
horizon: "now"
order: 4
depends_on: ["GRID-01", "GRID-02", "GRID-03"]
---

# GRID-04 · Edit Pages on the shared page grid

Design: [docs/shared-page-grid.md](../../docs/shared-page-grid.md).

- State becomes `{ plan }` over `src/lib/pagePlan.ts` with `fileId: 0`; `editPages.js` takes the plan.
  Thumbnails leave the state (the grid renders them).
- `PageWorkspace` with the file name and page count as the heading, `HistoryButtons` in the header,
  the bulk actions (all included, all skipped, invert) in the rail, "Add page numbers", the Download
  element, the Compress and Sign hand-offs and "Start again" pinned, like Merge. `hideIdentity`.
- `PageGrid.module.css` in `src/shell/` is deleted; the stale lines that call it shared
  (`docs/module-boundaries.md`, its own header comment) go with it.
- The failing test first: `e2e/cross-tool/page-grid-parity.spec.js` (the parity guard in the design),
  seen red against today's Edit Pages.

## Acceptance

- The parity guard passes at 1280 and 390.
- Every Edit Pages unit and e2e spec is rewritten against the shared grid's selectors and passes;
  `e2e/handoff/edit-pages-finish.spec.js` still passes.
- Repaired files (DEBT-54) still open and export.
