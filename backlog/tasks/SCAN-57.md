---
id: "SCAN-57"
title: "Clear all sits on the name row on desktop too"
status: "done"
priority: "P2"
epic: "scan-next"
depends_on: []
---

# SCAN-57 · Clear all on the name row

*Opened 2026-11-05* from Shlomi on pdkef.com/scan-to-pdf/: "the clear all files seems in the wrong place and wrong theme".

## What is wrong

On desktop Clear all files sat in the rail, a white button on the mint panel between the settings and Download. The phone
already has it small and quiet at the end of the name row (SCAN-13).

## What changes

Desktop takes the phone's control: one `ScanClearAll`, in the workspace's header slot. The rail keeps the settings, Download
and the next steps. Each size keeps its label.

## Done when

- On desktop Clear all is on the name row, its text ending on the grid's right edge, and nothing of it is left in the rail.
- It still asks first, and Cancel keeps the pages.
- The phone looks as it did.
