---
id: "FORM-32"
title: "Spike: does OCR text raise Sign's detection precision and recall on the scored corpus"
status: "in_progress"
priority: "P2"
epic: "form-detection"
horizon: "now"
depends_on: []
---

# FORM-32 · Spike: does OCR text raise Sign's detection precision and recall on the scored corpus

## Why

Shlomi, 2026-10-08: Sign is the use case that matters for OCR, and the question is whether it buys
precision and recall over the current detection strategy. FORM-06 measured Tesseract as a *reader*
(label CER 1-4% on the Hebrew forms) and never as an input to detection. FORM-07 measured raster
geometry on the one real scan (`irs-1040-1970`: 0% to 54.7% recall at 97.2% precision) and concluded
"the detectors need text, not more geometry". This spike joins the two: OCR text in place of the
pdf.js text layer, through the production `detectFormFields`, scored by the existing corpus scorer
(IoU 0.5, one to one, `scoring/match.js`).

OCR cannot beat pdf.js text on a document that has a text layer, so the honest questions are:

1. On a scan, how much of the vector baseline does raster ink plus OCR text recover?
2. How much of that comes from the text (OCR vs no text vs perfect text)?
3. Is OCR text a drop-in for the pdf.js text layer (vector ink, OCR text)?
4. How fast does it fall off on a phone-quality raster?

## Arms, per scored row (12 rows, `node scripts/score-form.mjs --all`)

| Arm | Ink | Text |
| --- | --- | --- |
| A | vector (`collectPageInk`), production | pdf.js |
| B | raster (`inkFromRaster`) | none |
| C | raster | OCR lines |
| Cw | raster | OCR words |
| E | raster | pdf.js (perfect text, upper bound for C) |
| D | vector | OCR lines (drop-in test) |

Raster variants for B/C/Cw/E: `clean300`, `clean200`, `phone` (200 DPI, blur, noise; no rotation,
so the truth frame holds). `irs-1040-1970` uses its embedded scan (`native`) instead, and has no
arm A/D/E. OCR language is the form's known language plus `eng` (an oracle choice, stated).

## Contract between the two harness pieces

Scratch dir outside the repo; nothing is added to `package.json` and nothing reaches the tools.

- `raster/<row>-<variant>.png` (8-bit gray) plus `raster/<row>-<variant>.json`:
  `{row, pdf, pageIndex, variant, dpi, widthPx, heightPx, pageWidthPts, pageHeightPts, view}`.
- `ocr/<row>-<variant>.json`: `{row, variant, langs, psm, ms, lines: Run[], words: Run[]}`, where
  `Run = {str, left, top, width, height, dir, conf}` in percent of the rendered page view (0..100,
  top-left origin), the product's `PageTextRun` shape plus `dir` (`rtl` when the run has Hebrew or
  Arabic letters, else `ltr`) and `conf`.
- `<row>` is the truth file's basename without `.json`.

Pieces: `scripts/spike/form-32/renderAndOcr.mjs` writes both; `scripts/spike/form-32/scoreArms.mjs`
reads them and prints one table (recall, precision, per kind) plus `results.json`.

## Acceptance

- [ ] All arms scored on all rows and variants, one table, read against `baselines.json`.
- [ ] OCR time per page recorded (desktop Node; a phone is a separate measurement).
- [ ] A record under `docs/` in MOBI-10's format with an explicit GO / NO-GO / REWORK for OCR as a
  detection input, and what it would take on a phone if GO.
- [ ] No dependency, asset or product code change.
