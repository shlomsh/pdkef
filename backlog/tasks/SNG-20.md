---
id: "SNG-20"
title: "iOS gate: drive pinch-zoom, then the keyboard's Next, in the Simulator"
status: "done"
priority: "P2"
epic: "sign-fill-mode"
order: 2
depends_on: ["SNG-07"]
---

# SNG-20 · iOS gate: drive pinch-zoom, then the keyboard's Next, in the Simulator

*Filed 2026-09-26.* `npm run gate:ios`'s pinch scenario comes out MANUAL. Appium's `mobile: pinch` on
the WebView zooms to about 2.6x, but after it the keyboard's Next can't be found. Find out whether the
pinch dismissed the keyboard (a real iOS behaviour to design for) or the lookup misses it while zoomed.
Until then, Shlomi checks zoom kept between fields on his iPhone.

## Acceptance

- [x] The pinch scenario passes or fails on the app's behaviour, never MANUAL.

## Resolution (2026-10-01)

Neither guess. The pinch does not dismiss the keyboard, and the Next lookup works while zoomed: in an
isolated run (iPhone 17, iOS 26.2) the keyboard stays up at 2.4x to 2.6x, `Next` is found and tapped,
focus moves to the next field, and the scale holds. The gate's `Next` failed because the pinch scenario
started from state the scenarios before it left behind: after "tap outside" the next tap on a field did
not focus it (see SNG-23), so there was no keyboard to find a `Next` on. The scenario now reloads the
page first, checks focus and the keyboard before and after the pinch, and fails with the actual reason
at each step. Negative control: with the zoom lock broken (`maximum-scale=1` while zoomed, SNG-17's bug),
it fails with `zoom not kept between fields: 2.41 -> 1.00`. `nextField` also lost a stray copy of the
pinch scenario's catch (it named variables that don't exist there).
