---
id: "FORM-17"
title: "A comb with a divider before its last digits is one field, not two"
status: "open"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
depends_on: ["FORM-16"]
---

# FORM-17 · A comb with a divider before its last digits is one field, not two

## Why

ภ.ง.ด.90's amount combs draw a bold divider between the whole-number digits and the two satang
digits (on the right-hand sub-tables sometimes a second divider further left). The ink comb reader
(`pageInk.js`/`formGrid.js`) takes the divider as a comb boundary, so one field comes back as two or
three pieces, and the narrow trailing piece is square enough to be reported as a checkbox. On the
scored page 3 that is all 50 comb misses and nearly all 179 false positives (comb 24/74, precision
23.5; `corpus/scoring/baselines.json`, FORM-16).

## Acceptance

- ภ.ง.ด.90 comb recall and precision up, no scored form drops, gains re-recorded.
- An element-corpus row pins a comb with a heavier internal divider as one comb.
