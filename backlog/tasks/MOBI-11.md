---
id: "MOBI-11"
title: "A reviewable field-map stage in Sign, from the geometry detector, before any guided filling"
status: "in_progress"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-10"]
legacy_state: "In Progress"
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

- [x] On opening a PDF with no AcroForm in Sign, run the union detector (`formGrid.js` combs and
  checkboxes, `label.mjs` labels, `cells.mjs` cells, lifted out of `scripts/spike/mobi-10/` into
  `src/editor/adapters/pdf/` with unit fixtures from both spike forms) and offer the result as a
  proposed field map, never as filled content. *Lifted 2026-09-17* — the union detector is
  product code now (`fieldLabels.js`, `formCells.js`, both unit-tested); wiring it into a Sign
  UI proposal step is still open.
- [ ] The person can delete, resize, add and re-label a proposed field; nothing is written into the
  PDF until they type into a field they have kept. "Add a field" is a first-class action because
  recall is not 100%.
- [ ] Each proposal carries its label and kind; a low-confidence proposal is visibly tentative.
- [ ] MOBI-06's next/previous navigation consumes the reviewed map, not the raw detector output.
- [ ] Bring the failure classes in `scripts/spike/mobi-10/report-cells.md` down with fixtures,
  and add a Latin-script flat form to the ground-truth corpus so the numbers are not Hebrew-only.
- [x] Re-score with `score.mjs` against the reviewed ground truth; the numbers go in the spike record.

## Progress

**Step 1, done 2026-09-17 (`src/editor/adapters/pdf/fieldLabels.js`, `formCells.js`, both with
unit tests):** the two spike algorithms are product code, in the editor's page-percent
coordinate model rather than the spike's own 0..1-fraction contract (SIGN-05/ARCH-02: one
transform, not two). The spike's CLI scripts (`label.mjs`, `cells.mjs`) are now thin wrappers
over these modules, so `score.mjs` scoring against the committed ground truth is a live
regression check on the product code.

Writing `formCells.test.js` found a real bug in the ported algorithm (inherited from the spike):
a closed cell's own printed text was never actually detected, because the cell's field names
(`left/right/bottom/top`) didn't match what the overlap check expected (`x0/y0/x1/y1`) - the
comparison was silently `NaN`. Fixed (`cellRect()` in `formCells.js`). Effect on the union
numbers, verified against both real source PDFs (kept outside the repo): form 101 recall/
precision 69.8%/89.0% → 69.1%/91.4%; health 86.7%/80.2% → 86.7%/94.2%. Label association and the
overall REWORK decision are unchanged. Detail and the updated top-line table: `docs/
mobi-10-field-map-spike.md`; the older per-run numbers in `scripts/spike/mobi-10/report-cells.md`
carry a dated addendum rather than being rewritten.

Remaining: everything else in the scope list above - the Sign UI proposal/review step, MOBI-06
wiring, closing the report-cells.md failure classes, and the Latin-script corpus addition.

## Ideas harvested from the parallel spike branch (deleted 2026-09-17)

A second session ran the same spike on `claude/mobi-10-research-15aa19` with similar tools and,
by its owner's account, similar results; it recorded no scores, so nothing quantitative survives.
Two design ideas from its code are worth keeping, unverified:

- **Read AcroForm `/TU` tooltips as labels** when a form does carry widgets (widget-level `/TU`
  over field-level, then the field name), plus `MaxLen` and the comb flag. Free, high-precision
  labels for hybrid or partially fillable forms; both spike forms had no widgets, so the landed
  `extract.mjs` never needed it.
- **Group a row or column of checkboxes into one radio question** with a shared label found
  above or beside the group, leaving ungroupable checkboxes as they are. A checkbox row is usually
  one question with N options, which is what a review surface should show.

It also tried merging dotted-leader segments closer than 6 pt into one span before treating them
as a blank line, aimed at failure class 2 in `scripts/spike/mobi-10/report-cells.md`; untested.
Its W-9 ground truth was mostly the form's own AcroForm field list (20 of 22 targets), so it does
not stand in for the Latin-script flat form this ticket still wants.

