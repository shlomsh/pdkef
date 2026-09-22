---
id: "FORM-12"
title: "Stray rules from neighbouring boxes split table rows on form 101"
status: "in_progress"
priority: "P1"
epic: "form-understanding"
phase: "near-term"
depends_on: []
---

# FORM-12 · Stray rules from neighbouring boxes split table rows on form 101

## Why

On income tax form 101 (section ג, the children table) the name cell and both tick cells are
found on rows 2 and 6-13 but missed on rows 1, 3, 4 and 5, although every row is drawn the same
way. `buildClosedCells` in `src/editor/adapters/pdf/formCells.js` takes row boundaries from every
horizontal rule on the page and pairs only adjacent ones. On the missed rows, rules from boxes to
the table's left (for example y 450.42 at x 30.8-121.4) fall between the row's top and bottom, cut
it into two short bands, and neither band closes.

These rows account for 4 of the 9 missed text cells and all 8 missed checkboxes in the scored
itc101 baseline (ground truth t043-t045, t053-t055, t058-t060, t063-t065).

## Scope

Scope row boundaries so a rule only splits rows it actually crosses. Two strategies are being
compared against every scored form (per-column and per-connected-region). A first prototype that let
rows skip distant rules by a 20pt margin reached 94.2% recall on itc101 but cost the 2024 IRS 1040
1.2 points of recall and 4.1 of precision, so it was not taken.

## Acceptance

- The 12 ground-truth cells above are detected.
- No scored form's recall or precision drops below `corpus/scoring/baselines.json`; gains are
  re-recorded there.
- A `formCells.test.js` case pins a table row with a stray rule beside it.
