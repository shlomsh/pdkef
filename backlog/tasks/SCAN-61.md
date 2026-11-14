---
id: "SCAN-61"
title: "Scan's specs wait on real conditions"
status: "done"
priority: "P3"
epic: "scan-next"
depends_on: []
---

# SCAN-61 · Three specs that wait on the wrong thing

*Opened 2026-11-05* from the read-only review of Scan at `b7fd7e91`.

## Outcome

- `page-grid.spec.js` presses ArrowRight once the viewer's key listener exists. It is added in an effect after paint,
  and a key sent earlier is lost. Same family as the hover race fixed for SCAN-51.
- The "page wider than the screen is not taken" case in `camera.spec.js` waits for the capture machine's phase or a
  real time, not `__frames > 60`, which can be barely one hold on a fast machine.
- `waitForScrollToSettle` goes from `corner-drag.spec.js` and `corner-loupe.spec.js`, or waits on a scroll that happens.
- `offThread` has a test for a worker that dies mid-job, on the real main-thread fallback.

## Done, 2026-11-14

- `page-grid.spec.js` retries ArrowRight until the heading reads "Page 2 of 4" (`toPass`, 10 s).
- `camera.spec.js` waits for the hint to show and for 4 s of page time, not a frame count; the `__frames` init script is gone.
- `waitForScrollToSettle` is gone from `corner-drag.spec.js` and `corner-loupe.spec.js`.
- `scanPipeline.test.ts` has a worker that dies mid-job and the job finishing on the main thread.

The e2e sleeps ratchet went down from 42 to 40. The Scan Playwright project passes in chromium.
