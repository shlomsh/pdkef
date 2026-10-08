# FORM-32 · Does OCR text raise Sign's detection precision and recall?

**REWORK.** OCR text is not what holds a scanned form back; the raster geometry is. On a clean
raster, Tesseract *word* boxes give the detectors nearly everything perfect text would (precision
63.7% with no text, 79.4% with OCR words, 84.1% with perfect text), but perfect text itself only
lifts recall from 36.9% to 44.5%, against 85.0% for the same forms read from their vectors. Raster
geometry comes first (FORM-07), and OCR is worth re-measuring only once it has moved.
Measured 2026-10-08, ticket [FORM-32](../backlog/tasks/FORM-32.md).

## What was measured

The production `detectFormFields` on the 12 scored corpus rows, with ink and text swapped per arm,
scored by the corpus matcher (IoU 0.5, one to one). Raster arms use the production sources minus
`widgets` (a scan has none). OCR is tesseract.js 7.0.0, tessdata_fast, PSM 3, the form's language
plus `eng` (an oracle choice). Clean rasters are pdf.js renders of the vector page, so the truth
frame is exact; `phone` is 200 DPI with a 3x3 blur and 2% salt-and-pepper noise, no rotation.

| Arm | Ink | Text |
| --- | --- | --- |
| A | vector, production | pdf.js |
| B | raster (`inkFromRaster`) | none |
| C / Cw | raster | OCR lines / OCR words |
| E | raster | pdf.js (perfect text, the ceiling for C) |
| D | vector | OCR lines in place of pdf.js |

## Results

Micro-averaged recall / precision over the 9 flat rows (AcroForm rows excluded, as in the corpus
README):

| Arm | clean300 | clean200 | phone |
| --- | --- | --- | --- |
| A, today | 85.0 / 80.6 | | |
| B, no text | 36.9 / 63.7 | 38.3 / 65.2 | 22.4 / 51.8 |
| C, OCR lines | 38.6 / 75.1 | 39.1 / 68.6 | 23.3 / 55.4 |
| Cw, OCR words | 39.0 / 79.4 | 40.0 / 84.6 | 22.3 / 58.7 |
| E, perfect text | 44.5 / 84.1 | 45.5 / 82.1 | 29.2 / 64.6 |
| D, vector + OCR | 75.9 / 67.4 | | |

The one real scan, `irs-1040-1970` (400 DPI CCITT): no text 54.7 / 97.2, OCR lines 54.7 / 97.2,
OCR words 53.1 / 91.9. OCR adds nothing there.

## What the rows say

- **Where the raster ink works, OCR words match perfect text.** I-9 clean300: B 76.9 / 62.5,
  Cw 73.1 / 97.4, E 73.1 / 97.4. Health: B 86.7 / 63.7, Cw 86.7 / 97.0, E 86.7 / 100. Practice:
  recall 30.8 with no text, 100 with OCR words. Words beat lines, most likely because the detectors' caption
  and "explanatory cell" rules read short runs, and a Tesseract line glues a label to its neighbours.
- **The ceiling is the geometry.** Two rows get zero candidates in every raster arm, perfect text
  included: `hmrc-sa100` (white boxes on a light grey tint, no ruled edges for the threshold to
  find) and `thai-pnd90` (dense comb grids). `itc101` reaches 41% even with perfect text against
  96.4% from vectors.
- **Dotted leaders are the one place text decides, and OCR misses them.** `thai-sso`: perfect text
  73.9 / 100, OCR words 8.7 / 57.1. The leader source reads runs of dots, which Tesseract appears to drop.
  Leaders are geometry on a raster and belong to the raster pass, not to OCR.
- **OCR is not a drop-in for a text layer (arm D).** Recall 85.0 to 75.9, precision 80.6 to 67.4;
  `btl-p2` precision 22.4, `hmrc-sa100` 30.6. Expected, recorded so nobody tries it.
- **Phone quality halves everything,** and it does so with perfect text too (E 29.2), so that is
  also the raster pass.

## Cost

OCR per page on an M2 Pro in Node: 0.3-4.4 s for Hebrew and English pages, 2.3-7.8 s for Thai.
A phone was not measured.

## What would change the verdict

FORM-07's raster pass reaching vector-like recall on tinted boxes, dense combs and dotted leaders,
and holding on the `phone` variant. Then re-run this harness: if Cw still tracks E, OCR words are a
precision layer worth pricing on a phone. OCR also stays unapproved in
`docs/sign-tool-product-decisions.md` until then.

## Reproducing

Harness, not part of the test suite: `scripts/spike/form-32/renderAndOcr.mjs` (renders, degrades
and OCRs every row into a scratch dir; tesseract.js lives in a throwaway npm project, see its
header) and `scripts/spike/form-32/scoreArms.mjs --scratch DIR` (the table above; arm A reproduces
`baselines.json` on all 12 rows, and a stub run with pdf.js text as the "OCR" gives C = E).

## Other libraries (survey, 2026-10-08)

Since the gap is geometry, the stronger contender is a model that finds fields in a page image, not
a better OCR. Licences below were checked on the Hugging Face API the same day.

- **FFDetr** (`jbarrow/FFDetr`, RF-DETR trained on CommonForms, 2025-11): text input, choice button
  and signature boxes straight from the image, weights tagged Apache-2.0. Published as a PyTorch
  `.pth` only, so an ONNX export and a phone-size check come first; the RF-DETR size it uses is not
  stated (Nano to Large are Apache-2.0, the smaller and larger sizes are under PML 1.0). The
  CommonForms sources are Common Crawl PDFs with no stated terms. It fits the `FieldSource`
  contract and this harness can score it as is.
- **FFDNet-S/L** (same author, YOLO11): the published accuracy (mAP50-95 81.0 for L), but no licence on
  the weights and an ultralytics base, so treat it as AGPL. Out unless the author says otherwise.
- **Rivok/paddleocr-hebrew** (2026-08-29, Apache-2.0, ONNX): a PaddleOCR Hebrew word recogniser
  (7.4MB) and detector (4.6MB). Its own card claims CER 0.35% against Tesseract's 1.34%, and 2.33%
  against 16.14% on mixed Hebrew and Latin, which is Tesseract's weak spot here. Unverified, and the
  training-data licence is not stated. The candidate if OCR comes back.
- Out: Nutrient form-field-v1 (commercial), DocLayout-YOLO (AGPL), Scribe.js (AGPL), ocrs (models
  trained on CC-BY-SA data, Latin only).
