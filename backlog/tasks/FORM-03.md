---
id: "FORM-03"
title: "Take label association to the 85% gate, starting with the column header a tall table's last row cannot reach"
status: "open"
priority: "P1"
epic: "form-understanding"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# FORM-03 · Label association to the gate; first, the header a tall table's last row cannot reach

## Why

`headerAbove` in `src/editor/adapters/pdf/formCells.js` searches up to `HEADER_SEARCH_HEIGHT`
(220pt) for the text that labels a blank cell. Form 101's children table is **13 rows of ~22pt,
about 286pt tall**, so its lowest rows cannot see their own column header at all.

Measured: MOBI-11's tick-column change added 18 correct candidates and label association fell
**83.3% -> 80.7%** on that form, entirely because of this. The fields are right; the names are
missing. Label association is a gate criterion in its own right (85%), so this is not cosmetic.

## Label association now lives here (2026-09-25)

FORM-01 closed on form 101's recall and precision gate (94.2 / 97.8 after FORM-12 and FORM-13) and
handed this ticket the one gate criterion still short: **label association, last measured at 83.2%
against 85** on 2026-09-20. It has not been measured since. FORM-12 found 12 more cells in the
children table and FORM-13 dropped three captions, and both change what is labelled, so 83.2 is a
starting guess, not a baseline. The `headerAbove` reach below is the biggest known cause, not the
only one: FORM-14 (a caption centred in its cell is a heading, not a label) is another.

- [ ] **Measure first.** Re-score labels on both forms on today's code with the
  `scripts/spike/mobi-10/` chain (extract -> cells + label -> union -> score), not `score-form.mjs`,
  which runs `formCells` with no text and prints no label figure (FORM-01's caution).
- [ ] **Stop it drifting unseen.** Record a label figure per form in
  `corpus/scoring/baselines.json` as a ratchet like recall and precision, so the scored corpus fails
  when label association drops.
- [ ] Form 101 reaches 85% label association with recall and precision held, and the health form
  stays at or above its measured figure.

## Scope and acceptance

- [ ] Raising the constant is the obvious move and probably the wrong one on its own: 300pt of
  vertical reach on a page with no table would pull in unrelated text. Prefer a rule that follows
  the structure the detector already recovers, for example searching to the top of the current
  table's own run of row bands rather than a fixed distance in points.
- [ ] Whatever the rule, it must not lower label association on the health form, which is at
  96.9%.
- [ ] Unit fixture in `formCells.test.js` with a tall stack of row bands and one header above it.
- [ ] Re-score both forms and record the label numbers in `docs/mobi-10-field-map-spike.md`, adding
  the FORM-12 and FORM-13 rows its score table is missing.
