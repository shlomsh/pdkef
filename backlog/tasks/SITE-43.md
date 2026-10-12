---
id: "SITE-43"
title: "Home: the demo phone fits its column on narrow desktop windows"
status: "done"
priority: "P2"
epic: "polish"
depends_on: []
---

# SITE-43 · Home: the demo phone fits its column on narrow desktop windows

*Seen 2026-10-12 (Shlomi's screenshot, a laptop-sized window on pdkef.com): the demo phone is cut off
at the right edge, and the "sign it back" note is clipped on its left.*

## Cause (measured on pdkef.com)

The desktop hero grid is `minmax(32px,1fr) minmax(312px,588px) 40px minmax(0,588px) minmax(32px,1fr)`.
Grid growth splits free space evenly between the two content columns, so between 1024px and about
1100px the launcher column takes its full 588px while the launcher inside it is capped at 440px, and the
demo column gets what is left: 332px at 1024px. The demo stage needs a 150px note column, a 28px gap
and a phone of at least 300px (up to 360px on tall windows), so 478-538px. Measured: page
`scrollWidth` 1059 at a 1024px viewport, phone 765-1065px, note starting 77px left of its column.

## Fix

Give the demo column a floor the stage fits in: `minmax(480px, 588px)`. The launcher column then
shares the rest (376px at 1024px, its full 440px from about 1132px up). At 1280px and wider nothing
moves.

## Acceptance

- At 1024x768, 1024x832, 1060x832, 1100x900 and 1024x1200, in English and Hebrew: no horizontal page
  overflow, the phone and the note sit inside the demo column and the viewport, and nothing in the demo
  overlaps the launcher.
- 1280px and 1440px layouts are unchanged to the pixel.
- Guard: an e2e case under `e2e/home/`, seen failing before the fix.

## Also fixed (found by the guard)

The dock has ten tools now (1028px at its full 20px gap) but still turned `overflow: visible` at 960px,
sized for nine, so it ran past the page at 960-1027px; and the hidden tooltips over the first and last
tools hung past the viewport (page `scrollWidth` 1059 at 1024px). From 960px the dock's gap now narrows
fluidly (`clamp(8px, (100% - 800px) / 9, 20px)`), and the end tools' tooltips line up with their card's
outer edge. Guard: `e2e/home/demo-fits.spec.js`, both describes seen red first (10 of 12, then 8 of 10).
