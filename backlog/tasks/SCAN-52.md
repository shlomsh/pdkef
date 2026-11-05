---
id: "SCAN-52"
title: "Scan's pages use the shared page grid"
status: "open"
horizon: "later"
priority: "P3"
epic: "scan-next"
depends_on: ["SCAN-51"]
---

# SCAN-52 · Scan on the shared page grid

*Opened 2026-11-05* from SCAN-51. Guideline 20 says a tool never grows its own grid, and `ScanPageGrid` is one.
SCAN-51 shared the hover cluster (`PageCellActions`) and left the rest, because `PageGrid` reads PDFs through
`GridSource` and Scan holds photos drawn on a paper size.

## Outcome

- Scan's pages render through `src/shell/pageGrid/PageGrid.tsx`, with the same cell size, drag and keys as Merge.
- A page keeps its paper shape in the cell, Add pages stays the last cell, and a tap still opens the page.
- `ScanPageGrid` is gone and `e2e/cross-tool/page-grid-parity.spec.js` covers Scan.
