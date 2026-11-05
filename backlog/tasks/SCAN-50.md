---
id: "SCAN-50"
title: "On desktop a click opens a page full screen, Esc returns, and the arrows browse the scan"
status: "done"
priority: "P2"
epic: "scan-next"
depends_on: []
---

# SCAN-50 · A page at full screen on desktop

*Opened 2026-11-05* from Shlomi's look at an eight page book scan on desktop: the phone's viewer shows one
page on the whole screen and swipes through the scan, and the desktop card had no way to do either.

## Outcome

- A click on the page in the one-page view opens it full screen. A quiet Full screen button in the head does the same, for the keyboard.
- Esc returns to the card, on the page last shown.
- At full screen, Previous and Next (chevrons at the screen's sides) and the left and right arrow keys browse the pages. Left is always previous, as in `PagePreviewDialog`.
- It is the corners' existing full screen (`state.full`): the browser's own, or the layer where it has none.
