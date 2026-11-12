---
id: "SCAN-69"
title: "A PDF of phone photos is read like photos: its page found, the next page left out, upright"
status: "done"
priority: "P1"
epic: "scan-next"
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

- Why the whole photo comes through: `textBlockCorners` finds the text block on about half the photos, then `reachOut`
  pushes every side out to the sheet's own edge. That is right for a scan already cropped to its paper. On a photo, the
  sheet's edge is the table. Where no block is found, the whole sheet is used.

## What changes

Shlomi's call (2026-11-12): build the page from its text.

1. **Turn:** a page is turned upside down only when its half-turned copy reads up as well (`readsUpsideDown`). Book
   page 50 read -0.53 and -0.26 the two ways and was flipped; it now stays.
2. **A sheet whose border is not paper** (table, fingers, the next page) is a photo. Its page is the text block with
   book margins of its own around it, in the block's frame, not out to the sheet's edge. A sheet with paper to its
   edges keeps today's reach, so a clean scan comes through as before.
3. The bend Scan already measures inside the corners straightens the lines.

Then, after Shlomi saw 16 of 22 right through the tool, two lessons from cleaning the book by hand (2026-11-12):

4. **A book is consistent page to page.** A PDF is photographed or scanned as a whole: a sheet is read as a photo
   when most sheets before it were, so a photo with paper to its edges (book pages 5, 7 and 9) is no longer read as a
   scan. And the text block's width in line pitches is a book constant: 19.8 to 21.4 on the 14 pages sure enough to
   say. A column beside a figure (book pages 4 to 8) widens to that width toward the print. A block wider than the
   book's is left alone: the list of sources is set smaller, its lines closer, and narrowing it cut the page.
5. **A text block's two sides are nearly parallel.** Perspective tilts them apart by up to 0.056 (x per y) on the
   measured photos; a side fitted through lines wrapping round a figure leaned 0.17 and 0.25. A side leaning more
   than 0.08 from the other is fitted again at the better-held side's slope.

## Done when

- [x] Book page 50 comes out upright; the other measured photos turn as before.
- [x] On the 22 photos, no page keeps the table or the next page's sliver, run through the real tool and looked at by
  Shlomi before landing (2026-11-12). A fingertip still shows at the bottom edge of three pages, inside the page's
  margin; Shlomi closed the ticket with it.
- [x] A clean scanned PDF's pages come out as before: a sheet with paper to its edges keeps today's reach, and a scanned
  book stays scanned after one dark cover (unit tests in `photoPage.test.ts`).

## What changed

Landed on main 2026-11-12, `b14df2f9f` to `3d325d7c2`. `photoPage.ts` reads a photo's page from its text: lines traced
along their curves, sides fitted through their ends and kept nearly parallel, book margins around the block.
`pdfSheets` hands each sheet the book read so far: whether its sheets are photos, and its text width in line pitches,
which widens a column beside a figure. `textBlock.ts` keeps the scan path. Run through the tool, 16 of 22 pages came out
right after the first change and all 22 after the book and the parallel sides.
