---
id: "SCAN-51"
title: "On desktop the grid is home: delete, reorder and open pages there, one click to the page at full window"
status: "done"
priority: "P2"
epic: "scan-next"
depends_on: []
---

# SCAN-51 · Grid, then full window

*Opened 2026-11-05* from Shlomi's look at a 25 page scan on desktop. He wanted to delete, reorder and open pages
from the grid, as in Merge and Edit Pages, and found the page card between the grid and full screen redundant.
The phone already had two levels: the grid, then the viewer. Desktop had three. He picked the two level workflow
from written sketches.

## Outcome

- Desktop opens a page in the phone's viewer, filling the browser window. The page card, the strip beside it and
  the browser's own full screen for Scan are gone.
- In the viewer: Previous and Next at the sides and the left and right arrow keys on a mouse device, the row of
  five, Corners in the same window, Esc back to the grid with the tile last shown in view and focused.
- Each tile shows Merge's hover cluster on a mouse device: Rotate, Remove, Open. It is the same shared component
  and the same look. Drag reorders; arrow keys move; R rotates; Delete removes; Enter opens.
- Remove keeps an Undo chip for five seconds (guideline 6), on the grid and in the viewer. Everything the page owned
  comes back with it.
- Removing the open page stays in the viewer on the next page, on the phone too. Removing the last page ends the scan.
- A photo still being read goes at once with no Undo: there is nothing to bring back yet. A held key removes one page.
- Removing the open page lands on its neighbour's corners if that page could not be read.
- Moving Scan onto the shared `PageGrid` is SCAN-52.
