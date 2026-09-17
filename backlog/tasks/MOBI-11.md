---
id: "MOBI-11"
title: "A reviewable field-map stage in Sign, from the geometry detector, before any guided filling"
status: "open"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-10"]
legacy_state: "Open"
---

# MOBI-11 · A reviewable field-map stage in Sign, from the geometry detector, before any guided filling

## Why

MOBI-10's spike ([docs/mobi-10-field-map-spike.md](../../docs/mobi-10-field-map-spike.md)) put the
on-device geometry path at 70-87% field recall, 80-89% precision and 83-97% label association on
two Hebrew government forms, under the 90/90/85 gate for an automatic question flow but well
inside what a person can review and fix. It also ruled out the alternatives: anydoc / pdf-inspector
emits no coordinates for PDF, and a vision model names fields well but places them badly and is
not available at runtime anyway.

## Scope and acceptance

- On opening a PDF with no AcroForm in Sign, run the union detector (`formGrid.js` combs and
  checkboxes, `label.mjs` labels, `cells.mjs` cells, lifted out of `scripts/spike/mobi-10/` into
  `src/editor/adapters/pdf/` with unit fixtures from both spike forms) and offer the result as a
  proposed field map, never as filled content.
- The person can delete, resize, add and re-label a proposed field; nothing is written into the
  PDF until they type into a field they have kept. "Add a field" is a first-class action because
  recall is not 100%.
- Each proposal carries its label and kind; a low-confidence proposal is visibly tentative.
- MOBI-06's next/previous navigation consumes the reviewed map, not the raw detector output.
- Bring the seven failure classes in `scripts/spike/mobi-10/report-cells.md` down with fixtures,
  and add a Latin-script flat form to the ground-truth corpus so the numbers are not Hebrew-only.
- Re-score with `score.mjs` against the reviewed ground truth; the numbers go in the spike record.
