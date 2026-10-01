---
id: "SNG-23"
title: "In the Simulator, the first tap on a field after tapping outside does not focus it"
status: "open"
priority: "P2"
epic: "sign-fill-mode"
horizon: "next"
order: 5
depends_on: []
---

# SNG-23 · In the Simulator, the first tap on a field after tapping outside does not focus it

*Found 2026-10-01 while closing SNG-20.* In `npm run gate:ios` (iPhone 17, iOS 26.2), after tapping a
fill field and then tapping outside (keyboard down, `activeElement` is body), a tap on another field
leaves `activeElement` on body and no keyboard, and `scrollY` jumps from 380 to 0. A second tap, after
the page scrolled, finds no element for the field's `data-fill-key` at all. Tried: waiting 1.5s for
the layout to settle, and tapping the field's rect without the harness's `ensureVisible` scroll; same
result. From a fresh page the same tap focuses the field every time.

Not known: whether this is the harness (Appium's tap coordinates once the page is scrolled and the
floating toolbar sits over its top edge) or something a person can hit. Settle it first: reproduce
by hand in the Simulator, then on Shlomi's iPhone. The gate's pinch scenario reloads the page to
stay clear of it, so nothing is blocked.

## Acceptance

- [ ] Known to be harness or app. If the app, fixed and covered by a gate scenario; if the harness,
  the tap helper fixed so the pinch scenario no longer needs the reload.
