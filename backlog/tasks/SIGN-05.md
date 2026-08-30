---
id: "SIGN-05"
title: "One page-coordinate transform"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-08-30"
---

# SIGN-05 · One page-coordinate transform

## Scope and acceptance

**One page-coordinate transform.** `coords.ts` now owns a pure `PageGeometry` with explicit visible CropBox, normalized `/Rotate`, `/UserUnit`, and mutually inverse PDF/viewport/editor affine matrices. `PdfSignTool` derives it from pdf.js page metadata; `PdfPageCanvas`, placement, drag/resize hit testing, and wrapper aspect ratio consume that same geometry. `signPdf` derives the identical frame from pdf-lib metadata and encloses every registry serializer in one graphics-state transform, so text, symbols, signatures, lines, rectangles, ellipses, and whiteouts keep the same on-screen position through export. Regression fixtures build real cropped pages at 0/90/180/270 degrees (including `/UserUnit 2`), prove the forward/inverse corners match pdf.js, run all seven element serializers through the shared matrix on every page, and verify the exported text anchor returns to its authored viewport percentage. Full unit/component suite: 1,850/1,850; typecheck and production build green.
