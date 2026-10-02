---
id: "SNG-09"
title: "Every mark lands neatly: at the fingertip, text sits on the line, a tick centres in its box, a circle wraps the word, a strike runs through it; local, declining when unsure, on every document"
status: "open"
priority: "P1"
epic: "sign-fill-mode"
horizon: "later"
order: 1
depends_on: []
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

## 2026-10-01 research (online, before any code)

Shlomi postponed OCR and any model. Four research briefs ran; sources are the agents' own, several from
search snippets (paywalled or blocked pages), and inference is marked.

**Decision: classical, tap-local, no model.**

- **Models/OCR: postponed, revisit only on a measured failure class.** OCR returns word boxes, not rules, so
  it cannot find an underline (at best it ranks which rule belongs to which label; that is FORM-06's
  question, parked). Sizes: tesseract-wasm about 2.1 MB (BSD-2, needs WASM SIMD), Tesseract.js default
  about 15 MB, onnxruntime-web wasm 10-14 MB with documented iOS Safari memory crashes
  (zenn.dev/kaz_sakai/articles/ios-safari-onnx-memory). The only head-to-head, AutoFormBench
  (arxiv.org/abs/2603.29832), has YOLO lines F1 0.74-0.82 against OpenCV 0.29-0.45, but its OpenCV baseline
  is naive, the inputs are born-digital renders, and the task is "which lines are fillable fields", so it
  does not decide this. Reopen if our corpus shows faint, dotted or comb rules as a large failure class;
  the spike would be a ~1 MB line-segmentation net, not OCR.
- **Method.** Binarise the window (integral-image Sauvola, Shafait 2008, Theta(HW)), gap-bridged horizontal
  run scan with a 0-3 degree shear search, nearest valid run; a box also needs a vertical pair. No published
  precision/recall exists for "nearest underline in a window"; adjacent form/table line work reports
  80-95% (snippets only). The 1-3 ms per tap and 90-95% on moderate scans are inference. Our corpus is the
  evidence.
- **Max snap distance: about 3 mm** (about 19 CSS px at 1x), from the real screen size, not a fixed px
  count. The agent's judgment, not a standard: touch offset error averages about 4 mm (a ACM 2019 study),
  fingertip 8-10 mm (MIT Touch Lab), Parhi 2006 9.2 mm targets, and dense forms have 6-8 mm line pitch, so
  a larger radius grabs the neighbouring line. A phone CSS px is about 0.16 mm, so derive px from
  devicePixelRatio and screen size.
- **Prior art.** Only Acrobat Fill & Sign (Sensei ML, scans OCR'd first) and Apple (iOS 17 / Sonoma) detect
  fields on flat forms, and both show a highlight before the tap. Xodo, Smallpdf, Dropbox Sign and pdfFiller
  place at the tap. No product does a silent snap; no published misplacement statistics. Adobe and Apple
  pages were not fetchable, so this is snippet-level.
- **Corpus.** No public scan set has rule or box ground truth under a licence we can commit (FUNSD and
  XFUND non-commercial and text-only; RVL-CDIP no clean grant; NIST SD2 licence unclear, 1988 IRS 1040,
  synthetic). Plan: (1) our own vector forms degraded to look scanned, 3 levels (mild scan, bad fax,
  phone shadow), exact ground truth, taps sampled near known lines and boxes plus decoys on text and blank
  areas; Augraphy (MIT) is a dev-time tool only, never a runtime dependency, and plain rasterise-and-degrade
  steps need nothing; (2) 10-20 public-domain real scans (US federal forms) hand-labelled as a calibration
  set, not the headline score.
- **Metric.** Each tap is a correct snap, a wrong snap, or a decline. Snap precision = correct / (correct +
  wrong), reported with the decline rate and per-degradation breakdown so declining everything cannot pass.
  Gate on the lower bound of a one-sided 95% Clopper-Pearson interval: 59 snaps with 0 wrong, 93 with 1, 124
  with 2. Taps in one form are correlated, so at least 30 documents and a cluster bootstrap by document.

**No duplication with the form-detection tickets (checked 2026-10-01 against main 81edb380).**
FORM-07 landed `rasterInk.js` unwired: a whole-page raster pass producing `collectPageInk`-shaped ink
(Otsu, skew search, deskew, gap-bridged row runs, rects, checkbox squares), about 160 ms at 200 dpi, 440 ms at
400 dpi. FORM-06 is the parked label-crop OCR spike. SNG-09 is a different job: a tap-time window read,
placement only, nothing wired into `detectFormFields`. Rules: SNG-09 reuses `rasterInk` primitives where they
are exported and does not edit `rasterInk.js`, FORM-06 or FORM-07; the degraded-scan corpus is built once
here and also serves FORM-07's own "second and third scan before any threshold is trusted" gap, so nobody
builds a parallel one. Coordinated with the Form-18 session by message (it confirmed it touches neither
the corpus nor `baselines.json`). `rasterInk.js` exports `otsuThreshold`, `estimateSkewDegrees`,
`mergeCollinear({offset, gap})`, `connectedComponents`, `letterHeight` and `inkFromRaster`; the page-level
`inkFromRaster` assumes a whole raster plus page size in points, so a window needs its own pxPerPoint. Its
OCR spike also found that Tesseract reads ruled-line fragments as `|` and `[`, so any later OCR needs the
rules masked first.

## 2026-10-02 parked open, and what "no model" means here

Shlomi doubted a no-model snap can give good engineering results. The honest read:

- **"Research" was two things.** The online research (done, above) only answered whether a model is worth
  its cost for this job; it said no for now. It did not prove a classical snap works. That is what the corpus
  is for, and the function is not built, so SNG-09 has no accuracy number yet.
- **What classical can do.** Finding a ruled line or box in a small pixel window is geometry, not
  recognition, and it is the part classical image code does well on a clean or moderate scan. Evidence in
  this repo: FORM-07's `rasterInk` found every checkbox (16 of 16) and 41 of 48 rules on a real 1970 scan
  with no model, at 97% precision. It is weak on faint, dotted, broken and comb rules, and on a rule that
  touches text.
- **Why it can still be safe.** The function declines when unsure and the tap then lands exactly where it
  does today, so a miss costs nothing and only a wrong snap hurts. The bar is precision, not recall.
- **When a model comes back.** If the scored corpus shows the 95% precision (lower bound) unreachable
  because of faint, dotted or comb rules, the next step is a spike on a roughly 1 MB line-segmentation net
  (not OCR) judged on the same corpus. Until then no model.
- **Why it is parked.** The remaining work (more documents, boxes, the function, the ratchet, the hook) is a
  real build, so SNG-09 returns to `open` / `later` and the corpus stays on main for whoever picks it up.

## 2026-10-01 progress: the corpus is built, the function is not

Committed on branch `worktree-sng09-marks-land-neatly` (75b1df5d), not pushed. The snap corpus lives in
`src/tools/sign/fields/corpus/snap/` (its README is the contract): five forms at 200 dpi with exact rule
truth, seeded scan/fax/phone degradation at three zoom views, a tap sampler, the three-outcome scorer and the
Clopper-Pearson bound. Controls: declining everything scores no snaps; an oracle that reads the truth scores
100% on clean pages and above 97% under skew. The oracle exposed two harness bugs (the expected target must
be the clearly nearest rule; fax breaks must cut a rule across its thickness), both fixed.

Next, in order:
1. More documents: the other pages of these forms (about 12 documents, about 2.5 MB), then more
   public-domain forms (needs a download decision). The gate needs at least 30 documents.
2. Truth for boxes; drop hyperlink underlines from the rule truth; a faint-ink level (hmrc-sa100,
   thai-pnd90 were skipped for pale rules).
3. `snapToPrintedLine(window, tap, { maxSnapPx })`, pure, reusing `rasterInk` exports, registered in
   `scripts/check-detection-purity.mjs`; then `scripts/score-snap.mjs` with a two-way ratchet in
   `snapBaselines.json`; then hook it into placement behind fill mode.
4. 10-20 hand-labelled public-domain real scans as the calibration set.

## 2026-10-01 board cleanup

- Status in_progress -> open. The Zapf checkbox part shipped (`zapfCheckboxSquare.test.js`); the tap-local snap to the printed line remains. Dropped SNG-03 from depends_on (retired).
