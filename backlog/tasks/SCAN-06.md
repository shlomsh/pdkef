---
id: "SCAN-06"
title: "Scan next: the table and the one-page view, with size and compression right before Share"
status: "open"
priority: "P1"
epic: "scan-next"
horizon: "now"
order: 1
depends_on: []
---

# SCAN-06 · The table and the one-page view

*Opened 2026-11-03* from the approved flow in [docs/scan-next.md](../../docs/scan-next.md) (sections 3 and 4)
and the mocks (https://claude.ai/artifact/TRgSt9SUjqyXM5NWGkr83L, screens 6 and 7). Ships first, fed by
today's native "Take a photo" input, so photo to WhatsApp gets shorter before the camera work lands.

## Outcome

- **No stop after each photo.** A new photo goes onto the table with its detected corners; the corners view
  no longer opens per photo (reverses the 2026-10-26 "review each photo first", decided 2026-11-03).
- **The table** (the loaded state): the name by date (`Scan 3 Nov 2026`, renamable, `OutputName`), the pages
  as a numbered grid with an Add pages tile, the line "Tap a page to fix its corners, turn it or retake it.",
  then Size with the real built size and Full · 2 MB · 1 MB · 500 KB inline (today's size-limit search), then
  **Share** as the one filled button on a phone (Download on desktop), then a quiet row: Download · Sign ·
  Redact, and Page size: Fit.
- **One page**, opened by tapping a page: the page as it will download, a quiet row of Corners (today's corner
  editor unchanged: loupe, Auto-detect, Whole photo, full screen, Use these corners), Rotate, Look, Retake
  (replaces this page in place), Remove, and Done.
- Nothing else on the first screen: Clear all moves behind the quiet row, the rating ask keeps its own rules.
- Desktop: the same table and page view in the existing two-column layout (pages beside the page, the rail
  holding Size and Download).

Pure model code stays pure (`scanState`, `scanActions`); components stay thin. Strings in `messages.ts`, in
voice, no em dashes.

## Acceptance

- [ ] On an iPhone: three photos with the native camera, then Share to WhatsApp, with no corners stop, in
      about 13 taps (16 today); the size shown before Share is the size of the file shared.
- [ ] Tapping a page offers Corners, Rotate, Look, Retake and Remove, and Retake replaces that page in place.
- [ ] Phone 390x844 and 375x667: the size row and Share are on the first screen of the table; no sideways
      scroll at 320. Desktop 1440x900 and 1280x720 still fill the first screen (SCAN-02's rule).
- [ ] Unit tests for the state changes start red; the corner-drag and loupe e2e specs still pass.
