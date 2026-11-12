---
id: "SCAN-69"
title: "A PDF of phone photos is read like photos: its page found, the next page left out, upright"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
depends_on: []
---

# SCAN-69 · A PDF of phone photos

*Opened 2026-11-12* from Shlomi's 22-page PDF of phone photos of an open Hebrew book: "this document is still off very
much in the scan code". Measurements only here; the photos are private and stay off the repo.

## What is wrong

Scan reads every PDF as an already-scanned document (`pdfSheets` → `assess`/`planPage`), and since SCAN-55 the photo
edge guess never runs on a PDF sheet. A PDF that is a stack of camera photos (a page on a table, fingers, a sliver of
the next page, the spine curl) is not a scan. Run through Scan today:

- the next page's sliver stays on about 15 of 22 pages;
- lines stay curved near the spine (`bentPx` up to 84);
- one page (book page 50) comes out upside down;
- fingers come out as black blotches.

A clean reference made outside the product (text-line rectification, edge cleanup) shows what the pages should look
like.

## Measured

Each photo's page outline was traced by hand and snapped to the paper edge, then compared with what Scan finds. Error is
the corner distance as a share of the photo's width; IoU is the overlap of the two outlines.

| | pages within 3% | mean error | IoU |
|---|---|---|---|
| Photo edge guess (`guessCorners`, as for a photo) | 6 of 22 | 1 to 38% | 0.42 to 0.97 |
| Today's PDF path (`assess` + `planPage`) | 0 of 22 | 9 to 28% | 0.51 to 0.82 |

- The photo guess is right exactly where its outline strategy finds an outline, with a score of 0.63 to 0.79. On the other
  16 photos the outline finds nothing, or scores 0.33 to 0.40, and the guess takes the next page's sliver or a piece of
  the page.
- The PDF path returns the text block's corners (or the whole sheet on 2 photos), never the page. The sliver, the
  fingers and the curl stay inside or around it.
- `bentPx` is 20 to 53 on most photos. `planPage`'s pieces carry `FLAT_PAGE` ("a bent page's mesh arrives with
  PE-09"), so the bend that is measured is never undone on a PDF sheet.
- Upright book page 50: `assess` asks for a half turn on the first read and none on the turned copy, so the page ends
  up upside down. The text says the wrong way is up.

## What changes

(to fill after measuring)

## Done when

(to fill)
