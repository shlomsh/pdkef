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

FORM-12 stopped stray rules from splitting table rows. On form 101's children table (section ג)
that also stopped hiding the column-header row (y 461.6-474.0pt, captions "מספר זהות" and "שם"). It
now closes on all four sides and `writableArea`'s side carve accepts it, because `rightHug` only asks
the caption to reach past the cell's midpoint. Two false positives, and itc101 precision 96.7 -> 95.6
(recorded in `corpus/scoring/baselines.json`).

## Leads

- A row whose cells hold centred captions directly above a run of identical empty rows is a header,
  not a field. The repeating rows below are the stronger signal than any caption margin.
- Tried and not taken: requiring a side-carved caption within 30pt of the cell's right wall. It
  clears the ratchet (itc101 94.2/97.0, health precision to 100), but "מספר זהות" sits 33.5pt away,
  and at 20pt three itc101 date targets are lost. That margin is tuned to one form.
- The 2024 1040's line 6c amount box (a shaded no-entry box, closed on all four sides) is a related
  false positive: nothing in the ink alone tells it apart from a writable box.

## Acceptance

- itc101 precision back to at least 96.7 with recall held at 94.2, and no scored form drops.
