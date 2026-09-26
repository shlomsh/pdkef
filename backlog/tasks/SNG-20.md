---
id: "SNG-20"
title: "iOS gate: drive pinch-zoom, then the keyboard's Next, in the Simulator"
status: "open"
priority: "P2"
epic: "sign-next-gen"
phase: "near-term"
depends_on: ["SNG-07"]
---

# SNG-20 · iOS gate: drive pinch-zoom, then the keyboard's Next, in the Simulator

*Filed 2026-09-26.* `npm run gate:ios`'s pinch scenario comes out MANUAL. Appium's `mobile: pinch` on
the WebView zooms to about 2.6x, but after it the keyboard's Next can't be found. Find out whether the
pinch dismissed the keyboard (a real iOS behaviour to design for) or the lookup misses it while zoomed.
Until then, Shlomi checks zoom kept between fields on his iPhone.

## Acceptance

- [ ] The pinch scenario passes or fails on the app's behaviour, never MANUAL.
