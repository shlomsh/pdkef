---
id: "SCAN-76"
title: "A book page's text sits centred: even margins from its text rows, padded in the paper's own tone"
status: "in_progress"
priority: "P2"
epic: "scan-next"
horizon: "next"
depends_on: ["SCAN-75"]
---

# SCAN-76 · A book page's text sits centred, with even margins

*Opened 2026-11-15.* A photographed book page whose inner side runs close to the spine comes out with its text block
off centre: a thin margin on the spine side and a wide one on the other. Shlomi's phone session of 2026-11-15 shows it
on page 4 (capture `034-takephoto.jpg`, private, not in the repo).

A first try during SCAN-75 (find the ink's bounding box, pad to even margins) changed 38 of 44 outputs, mostly for the
worse: ink is not only text (page-edge shadow, the facing page, figures), and the padding's tone did not match the
paper. It never shipped.

## Outcome

On a book page, the text block sits centred in the output with even side margins, and the added margin matches the
paper. A page that needs nothing comes through unchanged.

## Acceptance

- [x] The text block is found from text rows (the row reader the flattening already uses), not from all ink, so
      edge shadow, the facing page and figures do not count.
- [x] Padding is filled with the page's own paper tone, measured from its margins.
- [x] Scored on the 22 hand-traced book pages (numbers and ids only): no page gets worse, and pages with a spine-side
      squeeze get even margins.
- [x] A clean, already centred page is unchanged.
- [x] Unit tests first, on synthetic pages.
- [ ] Checked on a real phone.

## What was built (2026-11-15)

`src/tools/scan/lib/evenMargins.ts`, called in `flattenPixels` after the folded-corner fill and before the look, for
photographed pages only (a scanned PDF sheet is left as scanned). The block's sides come from the full text rows of
the dewarp's line reader (`pageMasks`, `smear`, `lineSamples`), each side a line fitted through the row ends:

- The **wide** side is the page's flat outer side; its margin is the outermost edge at least 6 rows and a quarter of
  the full rows hold, reaching 30% of the page's height. If more than 10% of the rows run past it by over 3% of the
  width, it is an indent and the page is left alone (p-007's bullets).
- The **thin** side runs into the spine; its margin is the edge most rows hold, since the spine side can still curve
  out at the top and bottom rows.
- The thin side's own edge is cut back up to 1.5% (never within 3% of the text), its gutter shadow lifted column by
  column to the paper's tone, and the page padded in that tone, read in 40 bands from the clean paper of its margins.
- A second look at the padded copy settles the padding by up to 6% of the width: the line reader leaves out the outer
  3% of a page, where spine-side rows often run.
- Left alone: margins within 3% of the width, a difference over 20%, a block narrower than 60% of the page, and
  rows that hold no edge.

## Measured

On the 22 hand-traced book pages, each through the automatic and the Fine-tune path (44 outputs), scored by an
independent column-ink reading of the output (the Document grey, no edge band left out):

| | outputs | side-margin difference, share of width |
| --- | --- | --- |
| centred | 36 | before: median 0.135 (0.069 to 0.148); after: median 0.002, 30 within 0.015, 34 within 0.02, worst 0.030 (p-020 automatic, from 0.120) |
| left as they were | 8 | p-004 to p-007, both paths: a narrow column of text beside figures, so no full-width block |

No output got worse. The padding widens a centred page by a median 10% of its width (at most 15%). A second pass over
all 44 outputs changes none of them. On a laptop it costs about 60 ms on a page it pads (median, at most 135 ms at
2000 px) and about 15 ms on a page it leaves alone.

With Scan's own corners (the 320 px guess repaired at 1000 px, as on the phone) in place of the traced ones, 10 of
the 22 pages are padded, none gets worse, and the 12 others come back as they were.

The ticket's capture 034: its page in that session's last PDF (after the look, so a proxy) reads 0.04 left and 0.17
right, and is padded by 13% on the left.

Must not fire: 30 phone captures from five sessions (by their inspected corners). Two book pages are centred; the 28
others (letters, forms, a bill with a table, flyers, handwriting, grid paper) come back as the same object.

Not centred: p-004 to p-007 keep their spine-side squeeze (their text is a column beside figures, which the rows cannot
tell from a layout choice). On the spine-right pages a faint
trace of the gutter shadow stays within about 2% of the text in the Original look (the Document look clears it).
On p-001 and p-015 the white gap a photo leaves at a cut corner (pre-existing) now sits a padding's width in from the
edge in the Original look.
