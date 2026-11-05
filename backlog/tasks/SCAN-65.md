---
id: "SCAN-65"
title: "A page removed or retaken from the camera's stack can be taken again"
status: "done"
priority: "P1"
epic: "scan-next"
depends_on: []
---

# SCAN-65 · The camera forgets a page that left the scan

*Opened 2026-11-05.* Shlomi found it: remove a page from the camera's stack, show it again, and the camera says "Already taken. Turn it."

## Outcome

- Only the pages still in the scan count as taken. A page removed from the stack can be taken again by itself.
- Retake from the stack takes the same page, with no "Already taken".
- A page brought back by Undo counts as taken again, and leaving a retake without a shot does too.
- A page the camera saw under the viewer and never took is taken once the viewer closes. The hint does not say to turn it.

## What happened

The capture machine keeps `takenHashes` for as long as the viewfinder is open, and the viewfinder stays open under the
page viewer. Removing a page there never reached it. `lastCaptureHash` held the camera too: on the page just taken it
kept waiting for the page to turn. Under the viewer the paused machine also fired on the page in view, took nothing, and
then waited for it to change, so a page never taken was passed over with "Turn the page".

## What changed

`useCamera` remembers which photo each hash belongs to. When the hashes of the photos that count as taken change, `keepTaken`
sets the machine's memory to them, so Undo and a cancelled retake need nothing of their own. The same runs when a pause
ends, which clears a wait on anything not taken.
`cameraProps` leaves out the page being retaken. Reproduced in Chromium on the old code for both remove and Retake.
