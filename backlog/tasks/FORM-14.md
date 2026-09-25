---
id: "FORM-14"
title: "A caption centred in its cell is a heading, not a label"
status: "done"
priority: "P3"
epic: "form-understanding"
phase: "near-term"
depends_on: ["FORM-13"]
---

# FORM-14 · A caption centred in its cell is a heading, not a label

## Why

`writableArea` side-carves a cell when its caption's right end reaches past the cell's midpoint. A
caption centred in the cell passes that test, so a table's column heading reads as "label, blank to
its left". FORM-13 removed the headings that sit over repeating empty rows; headings over a single
data row are still false positives. On the health declaration all four remaining false positives
are exactly this ("שם פרטי", "שם משפחה", "שנת לידה", "עיסוק").

## Evidence (prototyped under FORM-13, 2026-09-24, not landed)

- Rule tried: a side carve needs the caption to hug the right wall, left gap at least 3x the right
  gap; printed `/ /` separators exempt (they are centred and are not captions).
- Before FORM-13's rule: health 86.7/94.2 -> 86.7/100, itc101 94.2/95.6 -> 94.2/97.8, practice
  and both 1040s unchanged. It removed every centred heading on the scored pages, and on itc101
  page 2 the same three column headings FORM-13's per-row variant touched.
- Margins: the most off-centre heading scores 1.35 ("שם", itc101), the nearest real label 9.08 (the
  lower phone cells). Only 10 side-carved cells exist across the scored pages, all on two Hebrew
  forms. **Correction (2026-09-25): this was wrong.** uscis-i9-2025-01-20 (Latin) does produce side
  carves - its "List A" and "List B AND List C" table headings both reach their cell's midpoint and
  side-carve, "List A" at ratio 2.55, close enough to the RTL labels' 9.08 floor that a ratio alone,
  measured only on the two Hebrew forms this note was written against, would eventually have had to
  answer for an LTR case it had never seen. See "Landed shape" below for how that is handled.

## Measured on top of FORM-13 (2026-09-24)

- health 86.7/94.2 -> 86.7/100, every other scored form unchanged. Also drops itc101 page 2's
  "ה ת ל ו ש י ם ( ) ל פ י" heading, which FORM-13 cannot see because the rows under it hold text.
- Across every page of all five PDFs: 18 side-carved cells. 12 headings at ratio 0.90-1.35, 3 real
  labels at 9.08-13.74, 3 `/ /` date cells exempt at 1.00.
- With this rule in place FORM-13's rule changes nothing on any real page: keeping it (a backstop
  for a heading that hugs its wall) and removing it (flips the address-block known gap to 6) give
  identical candidates everywhere. Undecided.
- Two corpus fixtures use centred captions to mean "label" ("a captioned row over one empty row",
  and the FORM-13 unit test's captions sit at exactly 3.0) and need hugging captions so each rule is
  pinned on its own.
- On hold for more reference forms (Shlomi, 2026-09-24): 18 cells from two Hebrew forms is a thin
  base for a ratio, and the next forms are the check against overfitting.

## Before landing

- Re-measure on top of FORM-13 (the two overlap on itc101) and on any form added since.
- Decide whether 10 cells is enough evidence for a ratio, or wait for another RTL form.
- The corpus's `known gap` row "a label hugging its wall over two identically ruled continuation
  lines" is FORM-13's rule dropping a real label. A caption that hugs its wall is not a heading, so
  gating FORM-13's rule on this test should flip that row from 5 cells to 6.

## Landed shape (2026-09-25)

Two rules in `writableArea` (`src/editor/adapters/pdf/formCells.js`), both exempting printed
separators (`isPrintedSeparators`) as before:

1. **`RTL_RE`: a caption with no RTL character never side-carves.** The uscis-i9 correction above is
   why this comes first rather than the ratio alone - an LTR label that hugs a wall hugs the *left*
   one and leaves its blank on the right, the opposite shape from the side carve's own `right:
   textLeft`, so an LTR caption reaching the midpoint is never a label in that shape to begin with.
   `RTL_RE` covers Hebrew (U+0590-05FF) and Arabic with its supplements and presentation forms
   (U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB1D-FDFF, U+FE70-FEFC; the range stops short of U+FEFF, the byte-order mark).
2. **`HEADER_GAP_RATIO` (3): an RTL caption side-carves only when its blank-side gap reaches at least
   3x its hugged-side gap.** Unchanged from the exploration above - measured again on every page of
   every scored PDF (2026-09-25): every RTL heading reaches at most ratio 1.35 (itc101's "שם" column
   caption), and the only two RTL labels this has to keep are itc101's phone cells at 9.08 and 13.74.

FORM-13's row-run rule (`emptyRowRunBelow`, `MIN_HEADER_RUN`, `MAX_HEADER_RUN_WALK`) is removed. Once
a side carve is gated on the caption's own shape, it only ever survives for a caption hugging its
wall - which is a label, not a heading - so the row-run rule could only ever have been dropping a
real label, never catching one FORM-14's own rules miss. Measured with the drop disabled before this
landed: every scored form was byte-identical, and the corpus's own `known gap` row (an address-block
label hugging its wall over two continuation lines, which the row-run rule dropped as a false
heading) flips from 5 cells to 6 - it is a normal printed row now, not a known gap.

Scored corpus, before -> after (`node scripts/score-form.mjs --all`, 2026-09-25): health 86.7/94.2 ->
86.7/100 (its own four column headings, all centred, all removed); uscis-i9-2025-01-20 98.1/92.7 ->
98.1/96.2 (two of its three heading false positives removed - "List A" and "List B AND List C", both
LTR; the "OR" divider checkbox false positive is a different detector path and is unaffected);
thai-sso-1-10 17.4/88.9 -> 17.4/100 (one Thai heading, also LTR by `RTL_RE`, removed). Every other
scored form unchanged, matching the "no LTR form produces a side carve" correction above: uscis-i9
and thai-sso-1-10 did produce LTR side carves before this landed, and no longer do.

## Acceptance

- health precision above 94.2 with recall held, and no scored form drops.

Closed 2026-09-25: met (health 86.7/100, no scored form dropped). An independent review found each
rule's own test was also caught by the other gate; the tests now fail when only their rule is
disabled (mutation-checked), and `RTL_RE` no longer matches the byte-order mark.
