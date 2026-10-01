---
id: "FORM-19"
title: "A dotted leader after a label is a text field"
status: "done"
priority: "P2"
epic: "form-detection"
depends_on: ["FORM-16"]
---

# FORM-19 · A dotted leader after a label is a text field

## Why

Thai forms mark most answers with a label and a run of dots ("ชื่อ..............."), not a ruled box.
The dots are text, not ink, so `formCells.js` has nothing to close and every such field is missed:
on สปส.1-10 page 1 that is 22 text, 7 date and 3 signature targets (recall 17.4,
`corpus/scoring/baselines.json`, FORM-16). The text layer already carries the dot runs and their
positions. ภ.ง.ด.90 and the English forms use leaders too.

## Acceptance

- สปส.1-10 recall up with precision held, no scored form drops, gains re-recorded.
- An element-corpus row with declared text pins a labelled dot leader as one field, and a row of dots
  that is a table-of-contents style leader between two printed values as none.

## 2026-10-01 done

`formLeaders.js` reads dotted leaders from the text layer and is its own `leaders` source, last in
`SOURCE_ORDER`, so a widget or drawn cell always wins a spot. A run is split into its dot groups, each
placed from the page's calibrated dot advance and labelled from the text before it (or the run to its
left); kind comes from the label (signature, date, else text). A dots-only line under a field extends it
down, a dots-only run on the same line carries it sideways, a leader that runs into a page number is a
table-of-contents entry and is none, and a page that declares its own widgets gets no leaders. สปส.1-10:
recall 17.4 -> 82.6 (38/46) with precision held at 100; the other 8 forms are unchanged. Left on that
page: the two combs, the four glyph checkboxes (FORM-20), one amount cell and one unlabelled dotted line.
ภ.ง.ด.90 and the English forms use leaders too, but the scored pages have widgets, so they are not
measured here; the first version put leaders in the ink source and cost ล.ย.01 12 points of recall by
pre-empting its widgets, which is what moved them to a source of their own.
