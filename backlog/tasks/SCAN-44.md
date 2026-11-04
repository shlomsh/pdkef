---
id: "SCAN-44"
title: "A filled A4 form scanned with PDkef (2026-11-04): black edges and ghost text remain; stretch is fixed on main for A4"
status: "in_progress"
priority: "P2"
epic: "scan-next"
horizon: "now"
depends_on: ["SCAN-34"]
---

# SCAN-44 · A real scan below expectations

*Opened 2026-11-04* from Shlomi's own scan of a filled-in A4 form (two pages, both the same sheet; a private
document, kept out of the repo: only the findings are here). **Track: phone photo of a page.**

## What is wrong (measured on the PDF's two embedded images, 1255 x 1709 and 1336 x 1712)

- **Stretched.** The pages are 3.9% and 10.4% wider than A4 (ratio 0.734 and 0.780, A4 is 0.707); the form's
  own table, compared with the blank copy (IMG_4755), is 3.8% and 11.5% too wide, so the letters themselves are
  wider on page 2. This is SCAN-34's job (`pageAspect`, snapped to paper within 3%, then sized with
  `warpSizeFor`), now wired on main.
- **Black on the edges.** A dark diagonal wedge at the top-right edge on both pages and a black bar on the left
  edge near the middle (218 px and 139 px tall): the corners took in table and shadow, and the Document look
  turned them black. A page edge must never come out black (corner accuracy, a few more pixels of inset where
  the edge is uncertain, and a rule that a border-touching dark blob is cropped or whitened).
- **Ghost text.** Show-through from the back of the sheet remains in part of the lower cells.
- Not defects: the page is straight and the table rules are straight; the handwriting is intact.

## Re-measured on main (dc63a90b, SCAN-34 wired, PE-01 landed; 2026-11-04)

Shlomi's four test photos through a faithful copy of the current pipeline (inspect, turn, flatten; no filter):

| photo | quad | raw long:short | snapped | output | vs A4 |
|---|---|---|---|---|---|
| IMG_4755 (blank copy of this form) | right (was the whole frame before) | 1.438 | A4 | 1305 x 1846 | +0.02% |
| IMG_4757 (a letter) | right | 1.395 | A4 | 1155 x 1634 | +0.04% |
| IMG_4758 (a bill, other side of a flyer) | right | 1.507 | none | 1056 x 1592 | +6.6% |
| IMG_4759 (the flyer) | right | 1.485 | none | 1119 x 1662 | +5.0% |

- **Stretch: gone for A4 sheets.** The form's blank copy and the letter land within 0.05% of A4. A fresh scan of this same form lands on A4 on all four
  pages (below), so the 3.9% and 10.4% are gone.
- **Not A4:** the two sides of the flyer sheet read 1.507 and 1.485 (1.5% apart, so the measure is stable) and
  fall outside the 3% snap, so they keep their raw ratio: either the sheet is not a standard size, or the
  estimate is off on a wrinkled page. Whether to snap further (more sizes, or leave as measured) is open.
- **Black edges:** none in the four re-run outputs (outer 12 px dark pixels 0% on three sides; the left edge
  of 4757 holds a 1.3% black tick that is on the paper). The two source photos of this scan are still needed to
  confirm the wedge and bar are gone on those.
- **Ghost text:** measured below.

## Ghost text in the Document look (measured 2026-11-04, prototype in the session scratchpad)

The ghost is marks 13-18% lighter than the paper with no darker core: the Document look maps them to the lightest
greys, under 12%, hard to see until the contrast is stretched. A mark here is a connected group of pixels under grey
250. The proposal: after the look, a mark whose darkest pixel is 224 or lighter becomes white. Grey 224 is about 82%
of the paper level. Real ink has a dark core, so its edges and strokes stay as they are.

| page | faint marks now | with the filter | pixels darker than 224 changed |
|---|---|---|---|
| this scan, page 1 | 2589 | 5 | 0 |
| this scan, page 2 | 2541 | 11 | 0 |
| IMG_4755 | 626 | 3 | 0 |
| IMG_4757 | 107 | 10 | 0 |
| IMG_4758 | 802 | 200 | 0 |
| IMG_4759 | 3491 | 104 | 0 |

- Faint marks here are those with no pixel darker than 192. This scan's rows are simulated on the PDF's embedded
  images, which are already the look's output; the four photos ran through a scratchpad copy of `filters.ts`.
- **Checked by eye:** the stamp, the handwriting and IMG_4758's blurred fine print keep every glyph (a few single
  dots go). Hairline paper cracks on the crumpled page fade, which helps.
- **Rejected:** a cut-off of 192 removes parts of the stamp, fine print and light strokes. Lowering PAPER to 0.84
  clears the ghost too but changes 39,000 to 86,000 ink pixels a page, thinning all text.
- **Where the line falls:** on a clean text ladder, text at 80% of the paper level is untouched and text at 82%
  goes. Today that lighter text is at most a 10% grey.
- **Limits:** a ghost stroke touching a rule or a letter stays, as it joins real ink. Cost is under 30 ms a page on
  this machine at these sizes.

## Fresh scans (2026-11-04: the same form, four pages; a service slip, one page)

Both PDFs are in the Original look, private, and kept out of the repo. The look's results below are simulated on
their embedded images with a scratchpad copy of `filters.ts`.

- **Stretch: gone.** All four form pages read 0.7069 to 0.7071 (A4 is 0.7071).
- **The wedge is the one defect left.** Pages 2, 3 and 4 each have a dark triangle in the top-right corner (117 x
  244, 133 x 278 and 187 x 309 px, about 1% of the page), solid black in the Document look. The quad is right:
  the top and right edges are straight and meet where the corner should be. The wedge is table showing where the
  sheet's corner is folded away: the sheets are held by a paper pin at the top right, which folds them there
  (confirmed by Shlomi, 2026-11-04). Any pinned or stapled packet will do this. Small dark blocks at the bottom-left corner and
  left edge on pages 3 and 4 are the same kind of thing.
- **Shadows and show-through:** strong in the Original look on pages 1 and 3 (a cast shadow and a colour split,
  and the next sheet's table showing through). The Document look removes both on those two pages, read by eye.
- **Ghost filter on these pages:** no pixel darker than 224 changes.
- **The service slip** (ratio 2.19, correctly not snapped): its printed security pattern partly survives the
  Document look, and two overlapping stamps merge into one black block, so the Original look reads better for it.
  Print runs to the very top edge; whether the 1.6% inset clips it needs the source photo.

## Corner fill (prototype, 2026-11-04, session scratchpad)

A dark mark that reaches a page corner along both edges, fills at least 80% of the triangle it spans there and
covers at most 3% of the page is table, not page. It is painted with the paper's colour, spread in from just
outside the mark, so both looks are fixed. Run before the look in the product, since the mask comes from it here.

- Found: the top-right wedge on pages 2, 3 and 4 (fill 0.99, 1.0, 0.85) and the small bottom-left blocks on pages 3
  and 4 (0.99, 1.0). Nothing on page 1 or on IMG_4755, 4757, 4758 and 4759.
- **Not found:** the first scan's wedge (both pages), at any grey cut-off tried. It reaches the corner as streaks,
  not a solid triangle, so this rule does not clear it.
- Left alone: dark slivers along one edge only (page 3's left edge), since real print can touch an edge too.

## A second real scan (2026-11-04, one page of three)

Shlomi's screenshot of the corner screen showed a letter on a dark table with the corners on the whole photo. He
had tapped Whole photo, so nothing is wrong with detection: on the photo cut from the screenshot it finds the page
in 96 of 96 runs across small crop and resampling changes. The one finding is SCAN-45: once tapped, the button is
disabled but still looks ready.

## Outcome

Rescanning the same photos after SCAN-34's wiring gives pages within 3% of A4, with no black edge wedge or bar
and no visible ghost text, and the result is added as a private regression check (the photos stay out of the repo).

## Acceptance

- [x] A rescan of the same form replaces the source photos (fresh scan, measured above).
- [x] Output aspect within 3% of A4 (done on main for A4 sheets, measured above).
- [ ] Decide what a sheet that is not a standard size does (IMG_4758 and IMG_4759: +6.6% and +5.0%).
- [ ] No border-touching dark blob larger than a few pixels in the output (the scoring used here: connected
  components under grey 100 that touch the page edge).
- [ ] Show-through: ghost text under a set contrast is gone, with handwriting and the stamp kept; measured on a
  blank cell and a written one.
