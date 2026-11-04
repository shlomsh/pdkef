---
id: "SCAN-46"
title: "A filled-in page with no vertical rules stays tilted; level its rows"
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

## What the fit does with the checks forced open (scratchpad only)

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

## Built (2026-11-04): level only

`measureBend` now levels rows that lean 2 degrees or less, with or without vertical rules. Rules alone still stay as
the corners made them. `fitBend` is unchanged. Four lines of code.

Measured on the output pages for the form, from the source photos for IMG_4755 to 4759:

| page | median line tilt, before | after |
|---|---|---|
| rescan page 2 | 0.93 | 0.21 |
| rescan page 3 | 0.65 | 0.28 |
| second scan page 2 | 0.68 | 0.47 |
| second scan page 3 | 1.89 | 0.08 |
| service slip | 0.45 | 0.13 |
| IMG_4757, from the photo | 0.57 | 0.29 |

- **The table around the sheet's centre fold (rescan page 4, reported 2026-11-04):** its rules leaned 0.4 to 0.9
  degrees; now within 0.4. A small fan stays, about -0.3 at the top and +0.15 at the fold.
- **The hinge stays.** The reported lines go from +2.45 left, +0.04 right to about +1.56 left, -0.91 right: the lean is
  shared out and the kink remains. Shlomi chose this on 2026-11-04 over the larger fix below.
- IMG_4758 and 4759 do not move. No dark edge on the four photos beyond 4757's tick that is on the paper.
- **Known risk:** the lean is read from the page's clean lines and the 2 degree cap is the only guard, so a page of
  handwriting that slopes uphill, or a poster's slanted shapes, can be sheared by up to that much.
- Not from this change: run a second time on its own output, the second scan's page 4 warps 85 px through its tables,
  under the fit check as shipped (0.3). That page came out fine the first time.

## Tried and dropped: keeping the bend

Loosening `explained` to 0.65 straightened the hinge and ruined IMG_4759 (a 66 px warp through a poster). Adding a test
that a fit reads lines it never saw (fitted on every other line, within 1.3) stopped that and took the reported lines
to +0.27 left, +0.09 right, at about 30 more lines and two thresholds tuned on some 15 pages. Dropped as too much rule
for the gain. It is in the history at 950a9e46. If the kink bothers on real scans, rethink the approach rather than
add another rule.

## Outcome

A page with handwriting and no vertical rules comes out level, and a flat page is left as it is. A hinge in the sheet
stays, by choice.

## Acceptance

- [x] A failing test first: a page of text leaning a degree with no rules is levelled; past 2 degrees it is left.
- [ ] A real rescan reads level by eye, including a page of sloping handwriting (the form's photos are not on this
  machine).
- [x] SCAN-17's tests hold. SCAN-20's scores do not exist yet.
- [x] The sheet's edge does not show on the four photos.
