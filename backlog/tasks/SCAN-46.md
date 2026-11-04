---
id: "SCAN-46"
title: "A handwritten page's bend is measured right and then thrown away, so its lines stay bent"
status: "open"
priority: "P2"
epic: "scan-next"
horizon: "now"
depends_on: []
---

# SCAN-46 · Bent lines on a filled-in page

*Opened 2026-11-04* from Shlomi's rescan of a filled A4 form (page 2, a private document: only measurements are here).
**Track: phone photo of a page.**

## What is wrong

The lines on the output are not straight. In the top third the right half is level (0.04 to 0.2 degrees) and the left
half leans 2.0 to 2.45 degrees, hinged near the middle of the page; further down every line leans about 1 degree. It is
the sheet's own shape, pinned at a corner, and it shows in the Document look.

## Why (measured on the output page, a second pass through the shipped fit)

`lineFit` finds the bend. Two checks then drop it:

- **`explained` is false.** `fitBend` asks the fit to leave at most half of the lines' wobble (`MAX_UNEXPLAINED`); this
  page scores 0.57. The handwritten lines pass the outlier filter and hold the score up.
- **No squaring.** With no vertical rules on the page, `measureBend` will not take out the lean, and `finishBend` needs
  squaring to apply anything to a fit that is not explained.

## What the fit does with the checks forced open (scratchpad only, nothing built)

| page | median line tilt, before | after | median wobble px, before | after | moves px |
|---|---|---|---|---|---|
| rescan page 2 (the one reported) | 0.93 | 0.07 | 2.5 | 2.0 | 23.2 |
| rescan page 3 | 0.65 | 0.07 | 2.4 | 1.2 | 6.4 |
| second scan page 2 (same sheet) | 0.68 | 0.13 | 3.0 | 2.3 | 26.7 |
| second scan page 3 | 1.89 | 0.08 | 2.0 | 1.1 | 13.7 |
| second scan page 4 | 0.95 | 0.50 | 4.8 | 2.2 | 27.9 |
| IMG_4757 (a letter) | 0.57 | 0.07 | 1.5 | 1.1 | 14.2 |
| service slip | 0.45 | 0.04 | 3.2 | 2.5 | 8.9 |

- The reported lines go from 2.45 to 0.22 degrees, level by eye. Print stays crisp.
- Handwriting that runs out into the left margin, past the printed lines, moves a little with the nearest lines.
- IMG_4758 reads 5 degrees after, on two lines: a measuring artefact, as the fit moves nothing more than 5.1 px there.
- These are pages already flattened once, not photos. The first pass's result on the photos is not known; the bent
  output says it did not correct this page.

## Outcome

A page with handwriting and no vertical rules comes out with its printed lines straight and level, and a flat page is
left as it is.

## Acceptance

- [ ] A failing test first: lines with a shared hinge plus a few wobbly handwritten lines keep their bend.
- [ ] The rescan's page 2 reads under 0.3 degrees on its printed lines through the real pipeline.
- [ ] SCAN-17's tests and SCAN-20's scores hold; straight pages still come back unmoved.
- [ ] The sheet's edge does not show where a level page moves past its corners.
