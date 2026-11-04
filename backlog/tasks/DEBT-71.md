---
id: "DEBT-71"
title: "Three row and skew finders do the work R35 says one should"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "later"
depends_on: []
---

# DEBT-71 · Three row and skew finders do the work R35 says one should

*Opened 2026-11-04* from "Conflicts to resolve" in [the handoff](../../docs/scan-enhance-handoff.md).

## Outcome

`pageLayout/textRows`, `dewarp/lineBend` and `rasterInk` each find text rows or skew. Decide which survives, or extract one shared finder, so R35 (READ-01) holds. Structure only; behaviour stays the same.

## Acceptance

- [ ] The three finders' overlap is listed with their callers.
- [ ] One finder, or a documented reason for each, with output unchanged on the existing fixtures.
