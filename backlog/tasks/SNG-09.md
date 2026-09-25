---
id: "SNG-09"
title: "On a scan, a tapped text box snaps to the printed line under the finger, found locally, with no whole-page detection"
status: "open"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: ["SNG-03"]
---

# SNG-09 · On a scan, a tapped text box snaps to the printed line under the finger, found locally, with no whole-page detection

*Filed 2026-09-25* from Shlomi's point that many forms are scans and recall will never reach 100%
(`docs/sign-next-gen.md` §5.6).

Detection finds nothing on a scan today (MOBI-14). A whole-page raster path (FORM-06/07) will still miss
fields. So tap to write has to be good on its own.

When the person taps, read only a small window of the rendered page around the tap: about 240×96 screen
px, sized from the app's zoom. Find:
- the nearest printed baseline or rule under or just below the tap;
- or the enclosing box.

Place the new text box on that line, sized to it:
- its height from the line spacing or the box height;
- its start edge at the tap, or at the box's start edge;
- its end edge at the rule's end or the box's end;
- RTL-aware: an RTL box grows leftward.

When nothing credible is found, place the box at the tap exactly as today. A wrong snap is worse than no
snap, so **precision beats reach**.

This runs on device, on the pixels pdf.js already rendered. There is no OCR and no model.

## Where it lives (from the form-detection session, 2026-09-25)

- **Location.** Field detection has one entry point, `detectFormFields` (4f42276f, ARCH-24 step A). The
  whole capability (detectors, entry point, corpus, scoring, fixtures) moves to `src/tools/sign/fields/`
  in the next landing, so the snap is a strategy there, not a new home.
- **Purity.** The line-finding is a pure function over a pixel window. It passes
  `npm run test:detection-purity` (FORM-22): no DOM, no pdf.js, no module state. Reading the canvas
  pixels is the one allowlisted boundary shim.
- **Scoring.** Its scan corpus is scored with `node scripts/score-form.mjs` (FORM-21), and it is held by the
  same two-way ratchet: any moved number fails until `baselines.json` is re-recorded with a note.
- **Sequencing.** Coordinate with that session before adding files under the fields folder while the
  move is in flight.

## Acceptance

- [ ] A scored fixture set of scans (form 101 printed and photographed, a Latin form, a skewed scan),
  with taps sampled on and near real lines. The snap is correct at least 95% of the time when it snaps.
  It declines rather than guesses. The same corpus approach as MOBI-13.
- [ ] The snap never moves the box more than a small, stated distance from the tap.
- [ ] The same tap-local snap improves free placement on vector forms, on lines the detector missed.
- [ ] A spike question is added to SNG-03: the cost of reading back the canvas pixels on iOS
  (`getImageData` on a large canvas) inside a tap.
