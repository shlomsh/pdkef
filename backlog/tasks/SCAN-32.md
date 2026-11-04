---
id: "SCAN-32"
title: "Scan next: a page photographed sideways comes out upright"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
order: 4
depends_on: []
---

# SCAN-32 · Upright pages, however the phone was held

*Opened 2026-11-04* from Shlomi's iPhone photos: a portrait page photographed with the phone sideways
(a landscape photo) comes out lying on its side, and, worse, its text lines are never straightened: on
a sideways page the text runs down the image, and SCAN-17's row finder only looks for rows across it
(both prod photos measured zero bend). The page's quarter turn must be known before the bend is
measured, not only applied at the end.

## Outcome

- **The page's own text says when it lies sideways.** On the flattened page, its text rows (the SCAN-17
  row finder, `lib/dewarp/lineBend.ts`) run across it when upright and down it when sideways. A pure
  `pageTurns`-style detector decides a quarter turn from that, with a confidence, and says nothing when
  the page has too little text.
- **The way the phone is held picks the direction.** In the live camera, the device's orientation at
  the shot (screen orientation or device motion, where the browser allows it) tells which quarter turn.
  For a chosen photo, without it, a default turn plus the existing Rotate control.
- Upside down (a half turn) from text alone is a follow-up, not this ticket.
- The turn applies as the existing `turns` on the page (the same as pressing Rotate), so it is
  remembered and undoable.

## Acceptance

- [ ] The detector's tests: rows across, rows down, a form, a page with no text.
- [ ] Shlomi's two sideways photos come out upright.
- [ ] Checked holding a phone sideways in the live camera.

## Accepted limits of the automatic turn

The turn is decided once, at inspection, and stored in `turns` (`withInspection`), so Rotate is never undone by it. Two cases follow from that, both accepted on 2026-11-04 and both one Rotate press to put right:

- A draft autosaved before its inspection finished stays sideways when restored, since restored pages are not turned.
- Pressing Rotate four times back to 0 before inspection finishes reads as "not turned", so the found turn applies.

## A sideways shot can land upside down (Shlomi's iPhone, 2026-11-04)

The turn is always one quarter clockwise (`SIDEWAYS_TURNS`). "The way the phone is held picks the direction" above was
never built, so holding the phone the other way lands the page upside down.

**Text cannot pick the direction on a photo, measured 2026-11-04.** Row shape was scored on each page and on the same
page turned 180 degrees. The best signal, ink above the x-height core minus a quarter of the top-edge sharpness, gets
47 right, 0 wrong and 3 silent on the Hebrew book and Latin forms it was tuned on, 14 of 14 on Hebrew forms and 8 of 8
on Thai, but 4 right and 4 wrong on the phone photos: blur and perspective soften the edges it reads, and 4755 and 4758
score the wrong way even when upright. Hebrew and Latin have opposite signs on top and bottom edge sharpness, so
neither works alone without knowing the script. Page-level signals (dense rows first, ink mass high) are noise. Not wired in.

`screen.orientation` would not help either [reasoned, not measured]: when iOS rotates the page, the viewfinder and the
stream rotate with it and the text already reads across, so the sideways case is the one where iOS did not rotate.
What is left: device motion (exact, costs a permission prompt on iOS), or remembering the person's correction.

