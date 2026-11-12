---
id: "FORM-40"
title: "Cells: a table's header row and its row-label cells are not writing spots"
status: "open"
priority: "P2"
epic: "form-detection"
horizon: "next"
depends_on: []
---

# FORM-40 · A table's header row and its row-label cells are not writing spots

*Filed 2026-11-12 from SNG-25.* On a Google Docs table form (a kibbutz work-months declaration:
columns employer, months, count; rows of employers and printed labels such as "ביטוח לאומי - אבטלה")
the cell detector (`src/tools/sign/lib/fields/formCells.js`) offers a writing spot in:

- the empty part of each **header** cell ("שם המעסיק", "כמות");
- the leftover width of each **row-label** cell, beside the printed label, when the answers for that row
  belong in the other columns;
- a ruled blank right after text already printed on the line ("אני __שלומי שמש__________").

The empty body rows and the months and count columns are right and must stay.

SNG-25 hides these frames until Text or Date is armed, so this now shows only to someone filling, but
a tap there still places text in a header.

## Done when

- The form joins the scored corpus (`src/tools/sign/lib/fields/corpus/scoring/`) with reviewed ground
  truth, the false positives seen failing first.
- Precision on it rises with no recall drop on any other scored form (`baselines.json` only moves
  down in misses, with a stated reason).
- The detector stays a pure strategy behind the one contract (`detectFormFields`); no form-specific
  rule.
