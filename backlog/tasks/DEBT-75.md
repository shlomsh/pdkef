---
id: "DEBT-75"
title: "A damaged PNG fails the whole PDF in Image to PDF"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
depends_on: []
---

# DEBT-75 · A damaged PNG fails the whole PDF in Image to PDF

*Filed 2026-11-12, from the daily error read.* One production report on 2026-11-11 (Image to PDF,
desktop Chrome 156, build 1d73b6a, step `build_pdf_from_images`, all frames vendor). Resolved with
`errors:resolve --build 1d73b6a`: fflate's `err(0)` in `unzlibSync`, called from pdf-lib's UPNG
decoder (`PngEmbedder` → `PNG.load`). The PNG's compressed image data ends early, most likely a
truncated file. The browser can still show a thumbnail of such a file; pdf-lib cannot embed it.

Where it goes wrong: `addImagePage` in `src/lib/images/imagePage.js` calls `pdfDoc.embedPng(bytes)`
after only the signature check (`hasImageSignature`). The throw ends the whole background build in
`PdfImageToPdfTool.tsx` (`onBuildError`), so the person gets no PDF for any of their pictures. Per
the "Catching errors" rule in `.claude/rules/tools-and-shell.md`, files in the wild are malformed and
one bad picture must not fail the job. `addImagePage` is shared with Merge's photo pages, so the same
file fails a merge too (inferred from the code, not reported yet).

It did not count in Image to PDF's `failed`: the build ran in the background before any Download tap.

## Acceptance

- When pdf-lib cannot embed a PNG, the picture is redrawn through the browser (decode with
  `createImageBitmap`, re-encode on a canvas, embed that) and the PDF builds with every picture.
- If the browser cannot decode it either, that picture is left out and named with the existing
  "skipped" note, and the PDF builds from the rest. Nothing is reported for a file neither can read.
- The fallback lives in the shared image-page code, so Merge's photo pages get it too.
- A failing test first: a truncated PNG fixture beside a good one produces a PDF in Image to PDF
  (and in Merge's photo path), seen red before the fix.
- `docs/error-known-items.json` gains the entry for this fingerprint (area `pdf_tool_run`, step
  `build_pdf_from_images`, slug `image-to-pdf`, module pdf-lib) with the fix commit.
