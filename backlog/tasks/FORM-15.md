---
id: "FORM-15"
title: "1040 amount boxes the form leaves blank read as fields"
status: "open"
priority: "P3"
epic: "form-understanding"
phase: "near-term"
depends_on: []
---

# FORM-15 · 1040 amount boxes the form leaves blank read as fields

## Why

The 2024 1040's two false positives (precision 97.8) are the amount-column boxes on line 1i
(y 258-270pt) and line 6c (y 174-186pt), both x 504-576. Each is ruled and filled exactly like the
answer boxes around it, but neither is in the ground truth, which is derived from the form's own
widgets: the form puts no answer in the right-hand amount column on those two lines.

## What we know (measured under FORM-13, 2026-09-24)

- Not shading. Both cells are filled `rg 1 1 1` (white), like every amount box beside them. The grey
  on line 6c is the 21.6pt line-number cell to their left (`rg 0.753`). Earlier notes calling 6c "a
  shaded box" were describing that neighbour.
- `pageInk.js` does not keep fill colour, and across every scored form no closed cell has a
  non-white fill, true or false positive. A tint rule has nothing to calibrate against.
- Nothing in the ink tells these two apart from a writable amount box. Any signal will come from
  text or from the widget layer (the live form has no widget on either box), not from geometry.

## Acceptance

- A signal that is not specific to this form, measured on every scored form, or a recorded decision
  that these stay as known false positives.
