---
id: "SCAN-68"
title: "The swapped-photo camera spec waits on frames, not on a hint it may never see"
status: "done"
priority: "P2"
epic: "scan-next"
depends_on: []
---

# SCAN-68 · The swapped-photo spec reads a blip

*Opened 2026-11-06.* The nightly of 2026-11-06 went red on `camera.spec.js`, 1 failure in 10 attempts since SCAN-65 added it.

## Outcome

- "A page whose photo was swapped in the viewer is taken when the viewer closes" no longer depends on seeing the hint move.
- It still fails when a pause ending does not clear the wait on a page the camera fired on under the viewer.

## What happened

The spec waited for the hint to leave "Turn the page" and come back, to know the paused camera had fired. The hint
changes only once the shown line has stood for `minShowMs` (1200 ms) and the new one has been wanted for `settleMs`
(400 ms), while the camera fires again after `holdMs` (800 ms) and "turn" cuts in at once. That leaves about 400 ms at
most, and sometimes nothing, against Playwright polls that back off to one second.

## What changed

The spec notes when frames are analysed and waits for one two seconds after the swap, so it runs on the camera's own
clock. A fixed sleep was out: `e2e-sleeps` is at its record of 42. In Chromium on four workers the old spec failed 16 of
24, the new one passed 24 of 24, and with `paused` taken out of `useShot`'s effect it failed 8 of 8 on "2 so far".
