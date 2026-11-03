---
id: "SCAN-07"
title: "Scan next: the live capture logic, steady, sharp, once per page, with a confidence"
status: "in_progress"
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

## Progress 2026-11-03 (branch `claude/scan-07-capture`)

- `detectPage` (`edges/detect.ts`): outline first, brightness only below `CONFIDENT` (0.8); confidence is the
  winning quad's edge score over `FULL_SCORE` (0.6), capped at 1. Every corpus page scores 0.53 to 0.70. It
  passes the corpus gate `guessCorners` passes. About 23 ms against `guessCorners`' 64 ms on the same corpus run
  (Mac, under load; relative only). `guessCorners` is unchanged for photos from the library.
- `sharpness`, `quadArea` (`capture/sharpness.ts`), `averageHash`, `hashDistance` (`capture/hash.ts`).
- `stepCapture` (`capture/captureMachine.ts`): searching, locked, holding, fire, waitingForChange; 15 tests on
  hand-written sequences. Thresholds in `DEFAULT_CAPTURE_PARAMS` are first guesses until SCAN-05's recorded
  sequences tune them.
- `test:detection-purity` did not cover Scan at all; its module list now names Scan's detection and capture
  files.

Still open: tuning on SCAN-05's real sequences, and the worker that runs it (SCAN-08).
