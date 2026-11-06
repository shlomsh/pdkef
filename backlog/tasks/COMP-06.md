---
id: "COMP-06"
title: "Measured and dropped: higher Exact size rungs, display-size caps, dedupe and Jpegli"
status: "retired"
priority: "P3"
epic: "polish"
---

# COMP-06 · Best resolution under a size limit: measured, not worth building

*Filed and retired 2026-11-06,* from Shlomi's goal for Compress: the best resolution for a given size
limit. He judged the return too small for the cost. This record is here so the work is not repeated.

## Decision

Exact size keeps its ladder. It stops at 2400 px and quality 0.8 when that fits, even with budget left
over. That is on purpose. Do not re-propose the ideas below without new evidence.

## How it was measured

Chromium, the real Compress code, same limit on every side. The corpus was the 82 PDFs in Shlomi's
Downloads of at least 1 MB and under 100 MB whose planned images hold at least 30% of the bytes (about
8 are likely repeat copies). No errors or timeouts. Sharpness is the file's byte-weighted median of
final long side over the long side in inches of the image's largest placement, so it is computed, not
judged by eye. Placements were found for 99.7% of planned image bytes. Safari, phones and files under
1 MB were not measured.

## Higher rungs: small gain, slower runs

Stopping on the top rung left over a quarter of the budget unused in 20 of 71 runs (limit at 50% of the
file), 11 of 42 (25%), 7 of 16 (5 MB) and 12 of 58 (1 MB). Adding 4096 px at q 0.92 and 3200 px at
q 0.85 above the ladder gave:

| Limit | Files meeting it | Budget used, median | Median quality | Sharper |
| --- | --- | --- | --- | --- |
| 50% of the file | 71 | 0.97 to 0.98 | 0.65 to 0.65 | 6 |
| 25% of the file | 42 | 0.97 to 0.97 | 0.58 to 0.58 | 2 |
| 5 MB | 16 | 0.84 to 0.96 | 0.80 to 0.88 | 0 |
| 1 MB | 58 | 0.97 to 0.98 | 0.63 to 0.63 | 6 |

No file missed a limit or got softer, but total run time rose 1.45x to 1.83x. A top rung above 4096 px
can pass `MAX_CANVAS_AREA`, iOS Safari's limit.

## Display-size caps plus dedupe: more files fit, median unchanged

Each image's cap came from the largest place it is shown, and identical streams were written once, on
a ladder extended to 6000 px at q 0.92 and 3600 px at q 0.85.

| Limit | Files that fit today | With both | Over 10% sharper | Over 10% softer |
| --- | --- | --- | --- | --- |
| 50% of the file | 87% | 89% | 21 of 71 | 2 |
| 25% of the file | 51% | 65% | 6 of 42 | 2 |
| 1 MB | 71% | 90% | 14 of 58 | 2 |
| 5 MB | 100% | 100% | 1 of 16 | 0 |

Dedupe changed something in 43 of 82 files. It was only run on top of display-size caps, so its gain
alone is unknown. The cost is a content-stream walker for placements, Forms and /UserUnit included. If
this ever comes back, the largest placement decides, which is the lowest effective DPI, not the highest.

## Also looked at, from an outside research report

- **Jpegli:** its published gains are at high quality, in a study focused above 1 bit per pixel. Our
  Chromium output measured 0.38 to 1.01. An independent test on the libjpeg-turbo list found no
  consistent win and a slower encoder. No ready browser build was found.
- **Lossless JPEG steps (`jpegtran`, 5 images, 3 levels):** optimised Huffman tables saved 0.3-1.7% in
  Chromium and 7-25% in WebKit. Progressive saved 0.6-7.7% and 10-28%. Both need a JPEG rewriter we do
  not have.
- **COMP-03 and this goal:** Exact size already adapts to each browser's encoder, so COMP-03 mostly
  helps the fixed levels.
- **Not measured:** palette images for charts and screenshots, which we turn into JPEGs today.
