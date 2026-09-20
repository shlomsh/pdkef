---
id: "FORM-06"
title: "Spike: measure Tesseract heb on the two evidence forms before building any scanned path"
status: "open"
priority: "P1"
epic: "form-understanding"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# FORM-06 · Spike: measure Tesseract `heb` on the two evidence forms before building any scanned path

## Why

A scanned or photographed form is the one input where this epic's detector scores zero: there are
no vector primitives, so `collectPageInk` returns nothing, and no text layer, so there is nothing
for `fieldLabels.js` to associate. For a product whose flagship case is a form someone was handed,
that gap is real.

The 2026-09-20 research (agent report, this session) settled the engine question and left exactly
one number unmeasured:

- **Hebrew recognition in the browser is a one-engine language, and the engine is Tesseract.js.**
  PaddleOCR PP-OCRv5 and the new PP-OCRv6, EasyOCR, RapidOCR and every docTR pretrained checkpoint
  ship no Hebrew recognition model at all. docTR defines `VOCABS["hebrew"]` but registers every
  pretrained config French-only. The two Hebrew ONNX models on Hugging Face are both disqualified
  here: one is PolyForm Noncommercial, one declares no licence.
- **Weight is not the obstacle.** Self-hosted, `tesseract-core-relaxedsimd-lstm.wasm` is 1.06MB
  gzipped and `heb.traineddata` (tessdata_fast) is 0.47MB, about 1.6MB over the wire with the JS.
  Apache-2.0 throughout, which clears the runtime allowlist.
- **Accuracy is the obstacle, and it is unknown.** No credible published benchmark exists for
  Tesseract `heb` on dense printed Hebrew. GlotOCR Bench (arXiv 2604.12978, April 2026) did not
  test it, and what it did test is sobering: on *clean synthetic* Hebrew the best system measured
  was Gemini 3.1 Flash-Lite at 61% Acc@5, every open-weights model was at or below 55%, and
  PaddleOCR-VL scored 0%.

So this is a spike, not a build. One number decides whether FORM-07 is worth opening.

## Scope and acceptance

- [ ] Rasterise page 1 of both evidence forms at 300 DPI and run `tesseract.js` with `heb` and
  `output: { blocks: true }` (**boxes are opt-in since v6**; without it you get a transcript and
  the run is worthless).
- [ ] Score word-level character error rate, and box IoU against the text positions `pdf.js`
  already gives for the same page, which is a free and exact reference. Report per-region, not
  just page-wide: the label crops beside a field are what this would actually be used for, and
  short pre-cropped strings are where Tesseract is strongest.
- [ ] Measure the same thing on **label-sized crops** taken from the known field geometry, with
  PSM 7 or 8, not whole-page segmentation. Tesseract's own layout analysis is the part most likely
  to fail on a ruled form, and it is the part this product does not need.
- [ ] Decide GO / NO-GO / REWORK explicitly, in a record under `docs/`, in MOBI-10's format. A
  NO-GO is a good outcome if that is what the numbers say.
- [ ] If it is a GO, record the CSP mechanics as part of the finding: `corePath`, `workerPath` and
  `langPath` all have to point at same-origin assets, because tesseract.js fetches both the wasm
  core and the traineddata from jsDelivr by default and `connect-src 'self'` will simply fail.

**Do not ship anything from this ticket.** No dependency is added, no asset is provisioned, and
nothing reaches the tools. Note also that `docs/seo-competitive-findings.md` currently lists OCR
under "rejected as architecturally impossible" and SEO-26 plans to say so publicly; a GO here
means that row and that ticket are revised before any user-facing claim changes.
