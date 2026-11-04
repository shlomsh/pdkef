---
id: "SCAN-44"
title: "A filled A4 form scanned with PDkef (2026-11-04) came out stretched, with black edges and ghost text"
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

## Outcome

Rescanning the same photos after SCAN-34's wiring gives pages within 3% of A4, with no black edge wedge or bar
and no visible ghost text, and the result is added as a private regression check (the photos stay out of the repo).

## Acceptance

- [ ] Shlomi supplies the two source photos (private; scratchpad only).
- [ ] Output aspect within 3% of A4 on both pages.
- [ ] No border-touching dark blob larger than a few pixels in the output (the scoring used here: connected
  components under grey 100 that touch the page edge).
- [ ] Show-through: ghost text under a set contrast is gone, with handwriting and the stamp kept; measured on a
  blank cell and a written one.
