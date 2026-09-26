---
id: "SNG-09"
title: "Every mark lands neatly: at the fingertip, text sits on the line, a tick centres in its box, a circle wraps the word, a strike runs through it; local, declining when unsure, on every document"
status: "in_progress"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: ["SNG-03"]
---

# SNG-09 · Every mark lands neatly: at the fingertip, text sits on the line, a tick centres in its box, a circle wraps the word, a strike runs through it; local, declining when unsure, on every document

*Widened 2026-09-25:* under the owner's raster-first premise, this ticket's scope grew from text on scans to every mark (text, ticks, crosses, circles, strikes) on every document, not scans alone.

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

## A tick centres in its box: Zapf Dingbats checkboxes (done 2026-09-26)

**Bug.** On form 101 all 67 checkbox regions come from the text-glyph path (`collectCheckboxGlyphs`,
`src/editor/adapters/pdf/pdfObjects.js`). Page 1 has 30 × ❏ (Zapf code 0x6f) and 6 × ❑ (0x71); page 2
has 31 × ❏. The region was the glyph's advance by the font-wide Ascent/Descent (819/-143), which takes in
the drop shadow and the descender space. `placeSymbolOnRegion` centres the mark's ink on the region
correctly, so the tick landed off the square. Measured on screen before the fix, a tick on רווק/ה sat
0.61pt right and 0.86pt low of the square's centre: right and down, not "up and to the right".

**Fix.** The two Zapf checkbox codes carry the square a person sees, in glyph space, and it goes through
the same text matrix, size, Tz and rise as before: ❏ x[64,590] y[134,662], ❑ x[66,598] y[123,660]
per 1000 em. These are the inner (hole) contours of a74/a75 in the subset embedded in form 101, read with
@pdf-lib/fontkit. pdf.js's FoxitDingbats (drawn when a file does not embed the font) agrees: ❑ exactly,
❏ within 8/1000 em. The advances (762, 759) match the standard ZapfDingbats widths. Other checkbox glyphs
(☐ □ ❏ ❑ in any other font) keep the advance-by-ascent box.

**Guards.**
- `pdfObjects.test.js`: the square, the square under Tm/Tz/Ts, and an unchanged non-Zapf ☐.
- `corpus/zapfCheckboxSquare.test.js`: runs the real detector on form 101 and checks all 67 regions
  against the font's inner contour, placed by pdf.js's text layer, within 0.1pt. It was red before the
  fix, with a worst edge off by 3.3pt.

**Scored corpus.** The 36 glyph-backed checkbox truth boxes on itc101 page 1 were loose boxes around the
whole glyph, and would have matched the square below IoU 0.5. They were snapped to the printed square,
the FORM-26 precedent. Every scored number holds exactly, so there was no baseline re-record, only a
note.

**On screen** (dev server, desktop 1024px, 2026-09-26). The ✓ tool armed, and fill mode (`?next=1`) with
nothing armed, both put the tick in the square. A pdf.js render at 8× puts the ❏ interior at x
363.625-369.375pt, y 280.0-285.75pt from the top. The detected region is the same within 0.07pt. The
tick's ink centre is 0.02pt right and 0.09pt below the square's centre, and the ink sits inside the square
on every side. Not yet checked on a phone.

## Where it lives (from the form-detection session, 2026-09-25)

- **Location.** Field detection has one entry point, `detectFormFields` (4f42276f, ARCH-24 step A). The
  whole capability (detectors, entry point, corpus, scoring, fixtures) moves to `src/tools/sign/fields/`
  in the next landing, so the snap is a strategy there, not a new home.
- **Purity.** The line-finding is a pure function over a pixel window. It passes
  `npm run test:detection-purity` (FORM-22): no DOM, no pdf.js, no module state. Reading the canvas
  pixels is the one allowlisted boundary shim.
- **Scoring.** Its scan corpus is scored with `node scripts/score-form.mjs` (FORM-21), and it is held by the
  same two-way ratchet: any moved number fails until `baselines.json` is re-recorded with a note.
- **Sequencing.** The move landed on main as d7f8c817 (ARCH-24, FORM-21..24 closed). Nothing else is in
  flight there, except FORM-25: checkJs on the detector files, and an out-of-order source test.
- **Shape.** The snap runs at tap time on one pixel window, not as a whole-page pass, so it is a pure
  function in `src/tools/sign/fields/` (say, `snapToPrintedLine(window, tap)`), not a `detectFormFields`
  source.
  - Add the file to `DETECTION_MODULES` in `scripts/check-detection-purity.mjs`.
  - Add the canvas read to `FUNCTION_SHIMS` as a named function with its reason.
  - If a whole-page raster source is ever built (FORM-07), it is a `{ name, detect(page, context) }` source
    passed through `sources`, with `fields/corpus/thirdSourceContract.test.js` as the worked example.

## Acceptance

- [ ] A scored fixture set of scans (form 101 printed and photographed, a Latin form, a skewed scan),
  with taps sampled on and near real lines. The snap is correct at least 95% of the time when it snaps.
  It declines rather than guesses. The same corpus approach as MOBI-13.
- [ ] The snap never moves the box more than a small, stated distance from the tap.
- [ ] The same tap-local snap improves free placement on vector forms, on lines the detector missed.
- [ ] A spike question is added to SNG-03: the cost of reading back the canvas pixels on iOS
  (`getImageData` on a large canvas) inside a tap.
