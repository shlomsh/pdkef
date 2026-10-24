---
id: "GRID-04"
title: "Edit Pages shows its pages through the shared grid, layout and undo, identical to Merge"
status: "done"
priority: "P1"
epic: "polish"
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

## Outcome (2026-10-24)

Done. Edit Pages composes the shared pieces (plan history, PageGrid without labels, PageWorkspace,
usePreparedOutput + editPages with abort, useDownloadFlow). Parity guard 14/14 (96/96 at 4 workers x6
repeats); a production-build path matrix of 21 paths passed (open, download contents, bulk actions with
undo, preview, page numbers, replace, protected file, phone done strip, tablet). A protected PDF opens
the shared NeedsUnlock screen and Unlock hands back with "Continue in Edit PDF". A fresh review's
findings were fixed: Cmd+Z stands down while renaming, a replace resets a pending download, renames no
longer rebuild, look-alike files never share a cached result, a failed build can be retried, shared
code names nothing after Merge.
