---
id: "FORM-04"
title: "A Latin-script form in the ground-truth corpus"
status: "open"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# FORM-04 · A Latin-script form in the ground-truth corpus

## Why

Every number this epic quotes comes from two Hebrew Israeli government forms. MOBI-10 argued that
field *location* does not depend on text direction, and that argument still holds: the geometry
sources never read the text. But three things now in the code do read it, and all three were
written against RTL evidence only:

- `formCells.js` requires a label to **hug the right edge or the top edge**, in as many words
  because "RTL forms put a short label at one of those two". A Latin form puts it on the left.
- `classifyKind` matches the Hebrew roots `חתימ` and `תאריך` and nothing else.
- `fieldLabels.js`'s association rules and `dominantTextDirection` order a row right to left.

Until a Latin-script form is scored, "82.0% recall" is a claim about Hebrew forms, and the caption
rule FORM-01 adds would be tuned on Hebrew alone.

## Scope and acceptance

- [ ] One non-trivial Latin-script flat form (no AcroForm, real text layer), chosen for the same
  properties as the existing two: ruled cells, checkboxes, a repeating table, a signature line.
  **Check its redistribution terms before assuming it can be committed**, the way
  `scripts/generate-form-grid-fixtures.mjs` did for the Israeli forms; if it cannot, commit the
  geometry-only reduction and the ground truth, and leave the source to `--input`.
- [ ] Ground truth in the `CONTRACT.md` shape, built the way the existing two were and **reviewed
  before any scoring**. Both existing files needed correction, one of them twice (the health
  form's checkboxes in the original review, form 101's tick columns on 2026-09-20), so budget for
  the review rather than trusting the first pass.
- [ ] Score the current detector against it and add the row to the spike record, whatever it says.
- [ ] Name the left-edge hug and the Hebrew keyword list as findings if they are what fails.
