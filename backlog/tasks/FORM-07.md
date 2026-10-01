---
id: "FORM-07"
title: "A scanned form's ruled geometry, from its raster"
status: "open"
priority: "P2"
epic: "form-detection"
horizon: "next"
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
