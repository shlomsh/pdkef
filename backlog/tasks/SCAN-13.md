---
id: "SCAN-13"
title: "Scan next: the loaded flow on a phone, rebuilt from the approved screens"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "next"
order: 3
depends_on: ["SCAN-06", "SCAN-08"]
---

# SCAN-13 · The loaded flow on a phone, rebuilt

*Opened 2026-11-04.* Shlomi tried SCAN-08 on the iPhone and rejected the loaded screens: the old workspace was
still there under a new coat (the bar with Take a photo and Download above the page, the strip, Page size,
Size limit and a filled Download under Done, Page size and Clear all sitting with Sign and Redact, no way to
swipe between pages). "Lets go with a rewrite, not a lipstick on a pig."

Below 1024px the island no longer renders `ScanWorkspace`. Two screens are built fresh from the mocks in
[docs/scan-next.md](../../docs/scan-next.md); the engine under them (detection, warp, size search, PDF build)
and the desktop workspace stay.

## Outcome

- **The table** (`ScanPhoneTable`): the name, the numbered grid ending in Add pages (the camera), the hint,
  one card with Size, the limits and Page size, then Share as the one filled button. Under it the quiet next
  steps Download, Sign and Redact. Clear all stands alone at the very bottom. Pages reorder by hold and drag.
- **One page** (`ScanPageViewer`): full screen over everything. The page as it will download, swiped left and
  right through the scan, one row of Corners, Rotate, Look, Retake and Remove, then Done, and nothing under it.
  Corners happens inside the same screen.
- **The camera's stack** opens the same viewer on the last page; Done goes back to the camera, Retake takes
  that page again and goes back to taking pages. The separate Keep or Retake sheet is gone.
- **Gone from phones:** the bar, the page strip, the option blocks, the rail, the filled Download beside Share,
  and the Compress hand-off.
- **Verified** on a production build at 440x956, every screen scrolled to its bottom, then on the iPhone.

## Progress

- 2026-11-04: ticket and screen contract written; reducer events for the camera's review landed first.
