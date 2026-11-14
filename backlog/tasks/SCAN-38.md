---
id: "SCAN-38"
title: "The turn line shows the new count as soon as a page is taken"
status: "done"
priority: "P3"
epic: "scan-next"
order: 10
depends_on: []
---

# SCAN-38 · The turn line shows the new count as soon as a page is taken

*Opened 2026-11-04* from the known follow-ups in [the handoff](../../docs/scan-enhance-handoff.md).

## Outcome

The turn line keeps showing the old count until the photo arrives.

## Acceptance

- [x] A test that fails before and passes after.
- [x] Checked on a real phone or the Scan e2e where the camera is involved.

## Done, 2026-11-14

`useCamera` holds a `shooting` state, true from the moment a shot starts until its photo lands or fails, and
`Viewfinder.tsx` shows `count + 1` while it is true, so the turn line moves on as the shutter fires. A failed shot
drops back to the old count. Test in `Viewfinder.test.tsx`, seen failing first. The Scan camera e2e passes.
