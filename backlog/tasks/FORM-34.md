---
id: "FORM-34"
title: "BTL page 7: find what FFDetr sees that today's detector misses, and fix it in our own geometry"
status: "in_progress"
priority: "P2"
epic: "form-detection"
horizon: "now"
depends_on: []
---

# FORM-34 · BTL page 7: find what FFDetr sees that today's detector misses, and fix it in our own geometry

## Why

FORM-33: added next to today's vector detector, FFDetr lifts the 9 flat corpus rows from 85.0% to
93.4% recall at the same precision, and 41 of those 50 extra matches are one page, `btl-bl211-2015`
page 7 (today 45.3% recall / 86.7% precision, with FFDetr 93.0 / 93.0). The model is not shipping
(116MB, possible training overlap, NO-GO on scans), so it is used here once, as a pointer: the targets
it finds and we miss name a gap in our own detector, and the fix belongs in our pure geometry code.

## Scope and acceptance

- [ ] List the targets on `btl-p7` that arm A misses and arm AF matches: kind, position, and which
  of our sources should have produced them (ink cells, lines, combs, checkboxes, leaders).
- [ ] Name the cause per group from the page's own ink (`collectPageInk`) and text, with an overlay to
  look at. One cause per group, verified against the code, not guessed from the picture.
- [ ] Fix the cause in the detector, red test first (a corpus-row ratchet and a focused unit test),
  without a page-specific rule. Every other row holds or improves in `baselines.json`; `btl-p2`'s
  precision (30.1%) is watched, not worsened.
- [ ] Record the before/after rows here. FFDetr stays out of the product.
