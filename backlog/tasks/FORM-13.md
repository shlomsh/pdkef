---
id: "FORM-13"
title: "Tell a table's caption row from a writable row"
status: "in_progress"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
depends_on: ["FORM-12"]
---

# FORM-13 · Tell a table's caption row from a writable row

## Why

FORM-12 stopped stray rules from splitting table rows. On form 101's children table (section ג) that
also stopped hiding the column-header row (y 461.6-474.0pt, captions "מספר זהות" and "שם"). It now
closes on all four sides and `writableArea`'s side carve accepts it, because `rightHug` only asks the
caption to reach past the cell's midpoint. Two false positives, and itc101 precision 96.7 -> 95.6
(recorded in `corpus/scoring/baselines.json`).

## What we learned (2026-09-24)

- **The rows below are the signal, not the caption.** Taken: a side-carved caption whose own column
  continues as `MIN_HEADER_RUN` (2) or more contiguous, identical, empty closed cells is the column's
  heading (`emptyRowRunBelow` in `formCells.js`). One blank below a caption stays a field: that is the
  ordinary label-over-answer shape. itc101 94.2/95.6 -> 94.2/97.8; every other form unchanged.
- **Measured over every page of every scored form, it removes five cells, all headings**: on itc101
  page 1 the two children-table captions and the letter-spaced "השינויים בפרטי" title over the
  changes table (a third false positive nobody had named), on page 2 the "כתובת" and "שם" column
  captions. Run length 2 and 3 remove the same five; 4 keeps three of them.
- **Per cell, not per row.** Judging the whole row band as a header tied on every scored number but
  also swept an itc101 page-2 caption whose own column does not repeat. Not taken.
- **Compared and not taken here: a centred caption is a heading** (left gap at least 3x the right
  gap). Same itc101 result, and health 94.2 -> 100 as well, because health's four table headers sit
  over a single data row that the run test cannot see. It fixes `rightHug` itself, but the ratio
  rests on 10 side-carved cells from two Hebrew forms, so it gets its own review: FORM-14.
- **The 1040 line 6c box is not shaded.** The flagged cell (x 504-576) is filled white like every
  amount box around it; the grey fill is the 21.6pt line-number cell beside it. `pageInk.js` does
  not keep fill colour at all, and no scored form has a non-white filled cell interior, true or
  false positive. The 1040's other false positive, line 1i, is the same shape. Both are FORM-15.

## Acceptance

- [x] itc101 precision back to at least 96.7 with recall held at 94.2 (now 97.8), and no scored
  form drops. Re-recorded in `corpus/scoring/baselines.json`.
- [ ] An element-corpus row pins a caption row over repeating empty rows as not writable.
- [ ] A `formCells.test.js` case fails without the rule.
