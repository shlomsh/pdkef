---
id: "COMP-02"
title: "Compress's result card only names what the file holds, and a small saving reads as small"
status: "done"
priority: "P1"
epic: "robustness"
depends_on: ["COMP-01"]
---

# COMP-02 · The result card only names what the file holds, and a small saving reads as small

*Filed 2026-10-02.* Shlomi ran a one-page CamScanner scan of an ID card (one photo, no drawings, no
links) through https://pdkef.com/he/compress/ at the default level and got 528.08 KB to 521.72 KB,
"Saved 1%", under "PDF Successfully Compressed!" and the notice "Only the images were made smaller.
Text, links and drawings are exactly as they were." Two problems:

1. The notice is one fixed sentence (`imagesNotice`) shown after every image-only run, so it names
   text, links and drawings a scan doesn't have. It reads as boilerplate. The pre-run note
   (`imageShareNote`) has the same habit: it says "Text and drawings" whenever the file has text.
2. A 1% saving gets the same celebratory title as a 60% one.
3. The compare caption is one fixed sentence too (`compareCaptionPdf`): "Drag to compare page 1. The
   rest of the document compresses the same way." On a one-page file there is no rest of the
   document, and "the same way" is a promise nothing measures.

## Decision

- The post-run "only the images were made smaller" notice goes. The pre-run share note already says
  which part of the file can shrink, and stays on screen after the run; the numbers and the compare
  slider show the rest. The notice slot is used only when there is something to say.
- The pre-run note names only what the analysis found: text (`hasText`), never "drawings", which
  nothing detects.
- A result that is smaller by less than 5% (Shlomi, 2026-10-02) gets a plain title and one line saying the images were
  already compact. This is wording only: the file is still offered, as COMP-01 decided against a
  minimum-gain threshold for handing a file over. The line names the real cause: `compressPdfImages`
  now returns `keptBytes`, the bytes of images it could not attempt (not eligible, or undecodable), and `imageBytes`. When those are most of the
  image bytes the line says the main images couldn't be recompressed; otherwise it says they were
  already compact and, below Extreme, that Extreme can go further. (Measured on CamScanner-like scans:
  Recommended saves 37-88%, so 1% means either an already heavily compressed image or a kept one.)
- The compare caption drops the "rest of the document" sentence. A one-page PDF reads "Drag to
  compare the original and the compressed page."; a longer one "Drag to compare page 1 with the
  original." The page count comes from `analysis.pageCount`.

## Acceptance

- [x] No result card or note mentions links or drawings.
- [x] A smaller-by-under-5% result shows the plain title and the "already compact" line; 5% and
      over keeps the success title; Target Size met keeps the success title.
- [x] The compare caption never mentions the rest of a document, and doesn't name page 1 on a
      one-page file.
- [x] Unit tests in `PdfCompressTool.test.tsx` cover both, in EN and HE catalogues with matching keys.
