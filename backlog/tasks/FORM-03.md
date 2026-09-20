---
id: "FORM-03"
title: "A column header the last row of a tall table can still reach"
status: "open"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# FORM-03 · A column header the last row of a tall table can still reach

## Why

`headerAbove` in `src/editor/adapters/pdf/formCells.js` searches up to `HEADER_SEARCH_HEIGHT`
(220pt) for the text that labels a blank cell. Form 101's children table is **13 rows of ~22pt,
about 286pt tall**, so its lowest rows cannot see their own column header at all.

Measured: MOBI-11's tick-column change added 18 correct candidates and label association fell
**83.3% -> 80.7%** on that form, entirely because of this. The fields are right; the names are
missing. Label association is a gate criterion in its own right (85%), so this is not cosmetic.

## Scope and acceptance

- [ ] Raising the constant is the obvious move and probably the wrong one on its own: 300pt of
  vertical reach on a page with no table would pull in unrelated text. Prefer a rule that follows
  the structure the detector already recovers, for example searching to the top of the current
  table's own run of row bands rather than a fixed distance in points.
- [ ] Whatever the rule, it must not lower label association on the health form, which is at
  96.9%.
- [ ] Unit fixture in `formCells.test.js` with a tall stack of row bands and one header above it.
- [ ] Re-score both forms and record the label numbers in `docs/mobi-10-field-map-spike.md`.
