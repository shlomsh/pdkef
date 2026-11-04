---
id: "SCAN-46"
title: "A handwritten page's bend is measured right and then thrown away, so its lines stay bent"
status: "in_progress"
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

## Built (2026-11-04)

Forcing the checks open was not the fix: loosening `explained` to 0.65 alone straightened these pages and ruined
IMG_4759 (a 66 px warp through a poster) and, on a second pass, the second scan's page 4 (85 px through its tables).

- **`fitBend`:** a fit through at least six lines may leave 65% of the wobble (0.5 before), and must also read lines
  it never saw: fitted on every other line, the left-out lines' wobble about the bend stays within 1.3 of their wobble
  about their own straight lines. Real bent pages read 0.6 to 1.2, the ruined ones 1.5 to 6. Fewer lines keep the 0.5.
- **`measureBend`:** rows are levelled when they lean 2 degrees or less, with or without vertical rules. Rules alone
  still stay as the corners made them.

Measured through the changed code, on the output pages for the form and from the source photos for IMG_4755 to 4759:

| page | median line tilt, before | after |
|---|---|---|
| rescan page 2 (the two worst left halves: 2.45 and 2.04, now 0.27 and 0.42) | 0.93 | 0.09 |
| rescan page 3 | 0.65 | 0.28 |
| second scan page 2 | 0.68 | 0.11 |
| second scan page 3 | 1.89 | 0.08 |
| service slip | 0.45 | 0.13 |
| IMG_4757, from the photo | 0.57 | 0.29 |

- **The table around the sheet's centre fold (rescan page 4, reported 2026-11-04):** its rules leaned 0.4 to 0.9
  degrees; now within 0.35. It is levelled as a whole, not bent: a small fan stays, about -0.3 at the top and +0.15 at
  the fold.
- IMG_4758 and 4759 do not move, and the second scan's page 4 keeps its tables level. No dark edge on the four photos
  beyond 4757's tick that is on the paper.
- Rescan pages 1 and 3 and the first scan keep their small bends: their fits do not pass, and they get the level only.
- The second scan's pages 1 and 4 read 0.41 to 0.59 and 0.95 to 1.03 on this measure, which there follows handwriting
  and cells more than print; page 4 read by eye is level.
- Run again on its own result, a page moves 0 px on 6 of 11 pages and 8 px at most on the rest, leaving aside the
  edge curves, which find nothing real on a page with no table around it.
- `measureBend` takes about 200 ms on a page here, with the two extra fits in it.

## Outcome

A page with handwriting and no vertical rules comes out with its printed lines straight and level, and a flat page is
left as it is.

## Acceptance

- [x] A failing test first: lines with a shared hinge plus a few wobbly handwritten lines keep their bend.
- [ ] The rescan's page 2 reads level on a real scan (median 0.09 degrees on the output page here; the form's photos
  are not on this machine, so a rescan confirms it).
- [x] SCAN-17's tests hold and straight pages come back unmoved. SCAN-20's scores do not exist yet.
- [x] The sheet's edge does not show on the four photos.
