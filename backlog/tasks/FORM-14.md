---
id: "FORM-14"
title: "A caption centred in its cell is a heading, not a label"
status: "in_progress"
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
  forms, and no LTR form produces a side carve at all.

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

## Acceptance

- health precision above 94.2 with recall held, and no scored form drops.
