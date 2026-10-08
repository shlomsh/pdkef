---
id: "FORM-07"
title: "A scanned form's ruled geometry, from its raster"
status: "open"
priority: "P2"
epic: "form-detection"
horizon: "later"
order: 7
depends_on: []
---

# FORM-07 · A scanned form's ruled geometry, from its raster

## Why

Everything downstream of `collectPageInk` already takes plain data. `findCombRuns(ink)`,
`findCheckboxes(ink)`, `detectRegions(ink, geometry, ...)`, `detectCellCandidates(ink, geometry,
pageIndex, textItems)` and `labelFieldCandidates(candidates, textItems)` need axis-aligned ink and
positioned text runs, and do not care where either came from. So a scanned form is not a new
detector, it is **two new producers for the same two inputs**:

| input | vector PDF (today) | scan or photo |
| --- | --- | --- |
| `ink` | `collectPageInk`, CTM-aware content-stream walk | morphological line detection on the raster |
| `textItems` | `pdfjsPage.getTextContent()` | none needed for geometry; OCR with word boxes (FORM-06) only for labels |

That symmetry is the whole design: the raster path is the same algorithm in a different domain,
and it produces the same shapes into the same tested code.

## Scope and acceptance

Not gated on FORM-06: finding rules, boxes and combs in a raster is geometry and needs no OCR. Recognised text (FORM-06) is only needed for labels and stays a separate decision.

- [ ] **Classical CV, not a model, for the geometry.** Binarize, two morphological opens with a
  long horizontal and a long vertical structuring element to isolate rules, combine to recover the
  grid, connected components for checkbox squares. This is deterministic, testable against a
  fixture scan, script-agnostic, and costs no download. The 2026-09-20 research puts OpenCV.js at
  8.1MB official / 13.3MB single-file, with a reduced core+imgproc build reported at 2-4MB but not
  verified; a few hundred lines over an `ImageData` buffer may well beat taking the dependency at
  all. Measure before importing anything.
- [ ] **No document-understanding model.** MOBI-10 measured a vision model at 8.6% of boxes
  matching at IoU 0.5, drifting 5-12pt, and the 2026 research found the browser-viable layout
  models are 29.7MB (Table Transformer, MIT) at best and mostly unlicensable (DocLayout-YOLO's
  card says Apache, its LICENSE is AGPL-3.0). Firecrawl's own vector-grid detector exists
  precisely so a learned table model can be substituted away where ruling is present.
- [ ] Deskew before anything else, and treat a photograph as a different input from a scan.
- [ ] A fixture scan in the corpus, scored with `score.mjs` against ground truth like every other
  source, so the raster path is held to the same 90/90/85 gate and not graded on a curve.
- [ ] Assets stay lazy, off the critical path, out of the service worker precache, and same-origin
  under `connect-src 'self'`.

## Folded in

- MOBI-14: `irs-1040-1970` (a single CCITT image, no text layer) scores 0% recall against 64 annotated targets with 0 candidates, and its truth file is ready. Decide from evidence whether scans are common enough to serve (the allowlisted maintenance telemetry can say); if so, build the raster pass behind the existing detector without replacing the vector path on a document that has one, and re-record that row in `baselines.json`. The scans `f1040--1962` (non-zero CropBox origin, Flate raster) and `f1040--1944` (25 CCITT strips) are verified and ready to widen the evidence. OCR stays out of scope.

## 2026-10-01 board cleanup

- depends_on: dropped FORM-06. Raster geometry needs no OCR; MOBI-14 folded in.

## 2026-10-01 spike

Question: can classical CV over the page raster produce the `ink` shape well enough that the EXISTING detectors score meaningfully on a scan? Answer: yes for boxes and for ruled cells, not yet at the gate, and the part that is missing is mostly text, not geometry.

Delivered (not wired into `detectFormFields.ts` or the product, `baselines.json` untouched, `score-form.mjs --all` still 0 changed / 10 unchanged):

- `src/tools/sign/fields/rasterInk.js`: `inkFromRaster({data,width,height},{pageWidthPts,pageHeightPts})` -> `{verticals, horizontals, rects, skewDegrees}` in the `collectPageInk` shape and units (points, y up). Pure, no dependency, typed arrays. Gray, RGB or RGBA input, white-on-black handled. Otsu, projection-profile skew search (+-5 degrees), bilinear deskew, row-run scan with gap bridging and a density test, rows stacked into bands, transposed scan for verticals, collinear merge, checkbox squares from connected components (hollow, square, straight on all four sides). Every threshold is points or a share, never pixels. Output is carried back into the original page frame (it matters: about 1 point at the page edges for 0.25 degrees).
- `src/tools/sign/fields/rasterInk.test.js`: 15 synthetic-raster tests (rules, a box, a 6-cell comb run through the real `findCombRuns`/`findCheckboxes`, a 1 degree rotated copy, RGBA, inverted, speckle, noise-only and blank pages that yield nothing, a filled bar and a round letter that must not become a rule or box).
- `scripts/spike/form-07/extractImage.mjs` + `scoreRaster.mjs`: spike harness (pdfjs legacy in Node, the product `inkSource` recipe over raster ink inside `detectFormFields` so `reconcile` applies, then `toCandidates` + `greedyMatch`). Not in the test suite. Flags: `--dump`, `--cands`, `--adequacy`, `--oracle-captions`, `--downscale=N`, `--noise=p`, `--rotate=deg`.

### Numbers on `irs-1040-1970` (64 targets, empty text runs, same matcher at IoU 0.5)

- Image: one 1-bit CCITT image, 2925 x 4105, 400 dpi, page 527 x 739 pt. Skew found: -0.25 degrees (rules drift about 13 px across the page, so deskew was required).
- Ink: 89 verticals, 48 horizontals, 16 rects. By eye against the render: 37 horizontals are 40 pt or longer (the real ruled structure; the dashed year lines are not among them), 23 verticals are 24 pt or longer (walls and column edges), the other 66 verticals are text stems of 9.5 pt and up (no false combs came of them, 0 combs found, none expected). All 16 checkbox squares recovered, 0 extra squares.
- `inkFromRaster` wall time: about 440 ms for the 12 Mpx page in Node (deskew ~135, skew search ~95, connected components ~45, runs ~75); 160 ms at 200 dpi, 50 ms at 100 dpi.
- Score: 35 of 64 matched. Recall 54.7%, precision 97.2% (35 of 36 candidates; the 1 miss is a spouse-signature cell, typed `text` for lack of a caption, a `signature` target accepts only a signature). Per kind (recall / precision): checkbox 16/16 = 100% / 16/16 = 100%; text 19/41 = 46.3% / 3/4; table-cell candidates 16/16 matched a text target; signature 0/3; date 0/4. Baseline today: 0 candidates, recall 0.
- Ink adequacy (is the rule under each non-checkbox target present in the raster ink): 41 of 48 (44 of 48 at -0.225 degrees, see fragility below). So the geometry is mostly there; recall is limited by what the detectors need beyond geometry.
- Oracle (an upper bound, not a product path): handing the detectors a perfect "Signature"/"Date" caption under each such target moves recall to 56.3% (1 of 3 signatures). The preparer's signature and the two Date targets sit on ONE continuous printed rule with the caption beside it, and the date targets of the title line are hairline dashes, so neither is separable by ink.
- Robustness on the real scan: 200 dpi (box-filter downscale): 53.1% / 100%. 100 dpi: 42.2% / 93.1%. 0.3% salt-and-pepper noise: unchanged. Added rotation of +1.5 and -3 degrees: skew recovered to within 0.05 degrees (1.25 and -3.25 against the scan's own -0.25) and ink counts stay at 85-87 / 49-51 / 16 (the recall of those runs is not comparable, the truth is in the unrotated frame).

### Failure causes, in order of cost

1. **The detectors need text, not more geometry.** Of the 29 misses, 7 are signature/date lines and most of the other 22 are open-topped fields (a bare rule with the field label printed on it: the 1040 header, "first names of your dependent children", "Enter number" cells), by their top edge having no rule in the ink; a few are closed cells the cell reader merges or splits. `formCells.js` wants closed cells; `formLines.js` wants a caption; the dotted leaders belong to `formLeaders.js`, which reads the text layer. A scan has none of these. This is FORM-06's job (OCR word boxes), not a raster-geometry gap, and it caps recall at about 55% for this form without it.
2. **Thin dashed rules are lost.** "beginning ------", "ending ------" and ", 19 ------" are hairline dashes (2.2 pt dash, 0.7 pt gap, 4 px thick); the bridged run is 75% ink, under the 80% density bar that keeps text from reading as a rule. Lowering the bar to 70% finds them (adequacy 43 of 48) but chains the flat feet of words into false rules (144 horizontals), and that kills the writing-band test in `formLines.js`. Needs a smarter test than a global density, for example a per-band periodicity check.
3. **Text strokes read as rules.** Bars of T, E and bold capitals, and letter stems for verticals, are the junk. A letter-height floor (rules at least 3 capital heights, verticals 1.5, learned from the page's own components) took horizontals from 139 to 48 and fixed `formLines.js` (it rejects a rule whose writing band holds ink). Verticals still carry 66 stem-sized strokes; harmless today, a risk for comb detection on a form with dense bold text.
4. **Small frame/threshold effects.** The truth boxes are annotated by eye and sit 1 to 1.5 pt left of the real checkboxes; with exact output two of 16 boxes miss at IoU 0.5 until the output is carried back to the original (undeskewed) frame, and 1 pt matters on an 8 pt box. Also fragile: deskewing at -0.225 instead of -0.25 degrees moves recall by 3 points (two cells flip) with the same ink counts, so the downstream cell reader is sensitive to rule alignment at the 1 pt level.

### Honest read against the 90 / 90 / 85 gate

Not there, and not reachable by geometry alone on this form: recall 54.7% against 90 (not met), precision 97.2% against 90 (met), label association not measurable (no text at all, FORM-06) against 85. Checkboxes alone are at 100/100. What the spike establishes: the raster path is the same algorithm in a different domain and a few hundred lines of classical CV give detector-grade ink on a clean, bi-level 200-400 dpi scan, in under half a second at 400 dpi, with no dependency. What it does not establish: anything on a photograph, a grayscale or JPEG scan, a colour form, or a second scan (only this one CCITT page is in the repo; `f1040--1962` and `f1040--1944` from MOBI-14 are not committed).

### To productize

- A second and third scan in the corpus (grayscale JPEG, a skewed phone-camera scan) before any threshold is trusted; today every threshold is general but only validated on one page.
- Deskew robustness: the search is global and horizontal-only (+-5 degrees, 0.05 resolution); a photograph needs perspective correction and local background normalisation (adaptive threshold) first, and is a different input from a scan, as the ticket says.
- Dashed and dotted rules (cause 2) and the stem filter for verticals (cause 3).
- Browser side: render the page to a canvas at a capped pixel budget (about 200 dpi is enough, 160 ms), take `getImageData`, run it in a Web Worker, and carry the result back through `pageGeometry`. Which page frame: the module returns the original frame, so rotation, CropBox origin and `/Rotate` still go through `coords.ts` as they do for vector ink.
- Wire as a second ink source only when the page has no vector ink, behind `detectFormFields`, never replacing the vector path; re-record the `irs-1040-1970` row in `baselines.json` then.
- Lazy loading: the module is small and dependency-free, so it can ship as an ordinary lazy chunk; no model and no precache entry.
- Text for labels and open lines: FORM-06. Without it, signature and date recall on a scan stays at 0.

## 2026-10-01 landed unwired

`rasterInk.js` and its 15 synthetic-raster tests are on `main`, wired to nothing, so the geometry half of
the raster path exists and costs nothing at runtime; the harness is `scripts/spike/form-07/`. The ticket
stays open on a decision, not on work in progress: whether scans are common enough to serve (the
allowlisted maintenance telemetry can say) and, if so, whether to productize the second ink source or run
the FORM-06 OCR spike first, since labels and open-topped blanks are what limit recall on a scan.

## 2026-10-01 decision

Shlomi: keep OCR (FORM-06) as a possibility and check again in the future only. The raster path stays on `main` unwired; nothing is productized now.

## 2026-10-08 evidence from FORM-32

FORM-32 ran `inkFromRaster` on pdf.js renders of all 12 scored rows, so every row now has a raster
score with an exact truth frame (`scripts/spike/form-32/scoreArms.mjs`). Even with perfect text, raster
recall is 44.5% against 85.0% from vectors over the 9 flat rows. The gaps, in order: `hmrc-sa100` and
`thai-pnd90` get zero candidates (white boxes on a light tint; dense comb grids), dotted leaders are
never seen on a raster (`thai-sso` 73.9% with pdf.js text, 8.7% with OCR text), and the `phone` variant
(200 DPI, blur, noise) roughly halves recall. OCR is not the lever until these move.
