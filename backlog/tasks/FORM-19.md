---
id: "FORM-19"
title: "A dotted leader after a label is a text field"
status: "open"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
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
