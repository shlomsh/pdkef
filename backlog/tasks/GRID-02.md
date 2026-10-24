---
id: "GRID-02"
title: "Merge's document and rail layout moves to src/shell as the page workspace, nothing visible changes"
status: "open"
priority: "P1"
epic: "polish"
horizon: "now"
order: 2
depends_on: ["GRID-01"]
---

# GRID-02 · The page workspace layout

Design: [docs/shared-page-grid.md](../../docs/shared-page-grid.md), `src/shell/pageWorkspace/`.

`PageWorkspace` with the slots `heading`, `headerStatus`, `grid`, `railContent`, `railPinned`,
`phoneBar`, from the generic part of `MergeDocument.module.css` and `MergeRail.module.css`.
`DownloadElement` moves to `src/shell/` with a `DownloadMessages` slice. Merge's file list, chips and
file-drop line stay in Merge.

## Acceptance

- Merge renders the same at 390, 768, 1280 and 1600 (screenshots before and after).
- Merge's unit and e2e specs pass; `test:css` and the CSS ratchets do not go up.
