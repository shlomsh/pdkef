---
id: "SCAN-61"
title: "Scan's specs wait on real conditions"
status: "open"
priority: "P3"
epic: "scan-next"
horizon: "later"
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
