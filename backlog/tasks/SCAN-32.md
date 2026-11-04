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
(a landscape photo) is flattened correctly but comes out lying on its side.

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
