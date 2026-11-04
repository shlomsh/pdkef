---
id: "SCAN-44"
title: "A filled A4 form scanned with PDkef (2026-11-04): black edges and ghost text remain; stretch is fixed on main for A4"
status: "open"
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
  `warpSizeFor`), which is not yet wired into the page pipeline.
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

- **Stretch: gone for A4 sheets.** The form's blank copy and the letter land within 0.05% of A4. The 3.9% and
  10.4% in the original scan came from before the aspect wiring.
- **Not A4:** the two sides of the flyer sheet read 1.507 and 1.485 (1.5% apart, so the measure is stable) and
  fall outside the 3% snap, so they keep their raw ratio: either the sheet is not a standard size, or the
  estimate is off on a wrinkled page. Whether to snap further (more sizes, or leave as measured) is open.
- **Black edges:** none in the four re-run outputs (outer 12 px dark pixels 0% on three sides; the left edge
  of 4757 holds a 1.3% black tick that is on the paper). The two source photos of this scan are still needed to
  confirm the wedge and bar are gone on those.
- **Ghost text:** not re-measured (needs the source photos and the Document look).

## Outcome

Rescanning the same photos after SCAN-34's wiring gives pages within 3% of A4, with no black edge wedge or bar
and no visible ghost text, and the result is added as a private regression check (the photos stay out of the repo).

## Acceptance

- [ ] Shlomi supplies the two source photos (private; scratchpad only).
- [x] Output aspect within 3% of A4 (done on main for A4 sheets, measured above).
- [ ] Decide what a sheet that is not a standard size does (IMG_4758 and IMG_4759: +6.6% and +5.0%).
- [ ] No border-touching dark blob larger than a few pixels in the output (the scoring used here: connected
  components under grey 100 that touch the page edge).
- [ ] Show-through: ghost text under a set contrast is gone, with handwriting and the stamp kept; measured on a
  blank cell and a written one.
