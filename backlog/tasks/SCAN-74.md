---
id: "SCAN-74"
title: "With Auto off, a page held still says \"Tap to take it\", not \"Turn the page\""
status: "done"
priority: "P3"
epic: "scan-next"
depends_on: ["SCAN-37"]
---

# SCAN-74 · With Auto off, a page held still says "Tap to take it"

*Opened 2026-11-14* from SCAN-37's review. With Auto off and a page already taken, holding the camera on the next
page still read "Page N. Turn the page." though nothing was shot. The wording is the owner's pick.

## Outcome

A page held long enough but not taken (Auto off, or the camera paused) reads "Tap to take it", on screen and to
screen readers. Once it is taken, by the shutter, the line is "Page N. Turn the page." again.

## Acceptance

- [x] A test that fails before and passes after.
- [ ] Checked on a real phone, on the next photo session.

## Done, 2026-11-14

`liveView` in `viewfinderModel.ts` reads the capture state: in `waitingForChange` with a `lastCaptureHash` that is not
among `takenHashes`, the machine fired without a shot, so 'turn' shows as the new 'tap' hint (`hintTap`, "Tap to take
it"). The shutter's `markTaken` puts the hash in `takenHashes`, so a tapped page goes back to "Turn the page". Test in
`viewfinderModel.test.ts`, seen failing first. The phone box rides the next photo session with SCAN-39.
