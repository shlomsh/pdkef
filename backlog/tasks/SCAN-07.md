---
id: "SCAN-07"
title: "Scan next: the live capture logic, steady, sharp, once per page, with a confidence"
status: "open"
priority: "P1"
epic: "scan-next"
horizon: "next"
order: 1
depends_on: ["SCAN-05"]
---

# SCAN-07 · Deciding when a page is taken

*Opened 2026-11-03* from [docs/scan-next.md](../../docs/scan-next.md) (Page detection, step 2). Pure logic
only; the camera that feeds it is SCAN-08.

## Outcome

- **A confidence.** The detector answers `{ quad, confidence }` (or a sibling function does, keeping
  `EdgeGuesser` for the library path), from the scores it already computes. Outline first, brightness only as
  its fallback, instead of both on every frame (saves about 25 ms a check on the Mac, measured 2026-11-03).
- **A capture machine:** a pure reducer from frame observations (quad, confidence, sharpness, page area, a
  small thumbnail hash) to states (searching, locked, holding, taken, waiting for a new page) and one "take
  it" event. Corners smoothed across frames; taken only after a steady hold with enough sharpness and area;
  re-armed only once the page leaves or changes, so the same page is never taken twice.
- **Thresholds as named constants**, tuned on SCAN-05's recorded sequences, never on one phone by eye.
- The frame analysis runs in a worker, skipping frames while busy; it loads only after Start scanning.

## Acceptance

- [ ] The machine runs on SCAN-05's sequences under `npm test`: false captures, double captures and time to
      lock are scored and gated.
- [ ] Unit tests drive each state change from hand-written observation sequences, red first.
- [ ] `test:detection-purity` and `test:lazy-modules` pass; no DOM in the pure modules.
