---
id: "FORM-18"
title: "A comb drawn as separate squares is a comb, not a row of checkboxes"
status: "open"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
depends_on: ["FORM-16"]
---

# FORM-18 · A comb drawn as separate squares is a comb, not a row of checkboxes

## Why

SA100 draws each amount box as 11 separately painted squares with gaps between them: a '£' cell,
8 digit cells and 2 pre-printed pence cells. The detector reports no comb on the scored page and
88 checkbox candidates, 8 per amount box, so 0 of 11 amount targets are found and precision is 4.3
(`corpus/scoring/baselines.json`, FORM-16). A run of equal squares on one baseline at a regular
pitch is a comb whether its cells touch or not; a real checkbox stands alone or in a column.

## Acceptance

- SA100 comb recall up and its checkbox false positives down, no scored form drops, gains
  re-recorded.
- An element-corpus row pins a run of separate equal squares as one comb, and a column of the same
  squares as checkboxes.
