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

## What we learned (2026-09-22)

- **A row boundary is local to its column, not to the page.** `buildClosedCells` built one list of
  rule heights for the whole page and paired only adjacent heights. Any box anywhere on the page
  could split a table row it never touches. On form 101 the splitting rules were box edges at
  x 29-252 (y 450.42, 411.36, 408.52, 390.55, 387.67, 364.97), left of a table at x 255-540. No
  threshold rejected the missed cells; they were never built.
- **Two strategies were compared on every scored form and tied exactly** (itc101 94.2/95.6, IRS
  1040 2024 100/97.8, health and practice unchanged, 1970 1040 still 0):
  - *Per-column* (taken): for each top rule, walk lower rules up to `MAX_ROW_HEIGHT`; a column
    becomes a cell only when no rule height in between crosses that column. The adjacent-pair walk
    is its special case, and the cost stays about the same as before.
  - *Per-region* (not taken): union-find the ruling ink into connected regions and pair rows inside
    each. It needed an extra tighter tolerance for narrow tick cells, the pass took 2-5x longer, and
    dropping long lines from connectivity to stop page frames joining everything cost itc101 up to
    30 points of recall, because its rows connect through long table borders.
  - A first try that let rows skip rules more than 20pt from the column scored the same on itc101
    but cost the 1040 1.2 recall and 4.1 precision. Margins tuned per form are the wrong lever.
- **A stray split was hiding other problems, and fixing it exposed them.** Both strategies needed:
  - *Background fills are not walls.* The 2024 1040 paints its body as one unstroked 492x666pt
    fill; its left side at x=91.6 cut every name field once rows stopped being split. A filled,
    unstroked rect larger than a row both ways is now skipped as ink (`isBackgroundPanel`). On its
    own this takes the 1040 from 98.9/94.6 to 100/98.9.
  - *Heights just outside a taller band count as "in between".* `ruledCoverage` accepts a rule
    1.5pt off, so on the health declaration a sliver beside a radio square closed on the row rule
    1.3pt past its own edge and became 3 false tick cells.
  - *The children table's header row* (captions over the ID and name columns) was also split and
    hidden. It now closes and reads as two writable cells, so itc101 precision went 96.7 -> 95.6.
    Accepted as a deliberate ratchet-down; the fix is FORM-13.
- The element corpus's known gap "a painted checkbox square inside a printed ruled cell" now reads
  `cells: 2`, as its own note predicted, and moved out of `KNOWN_GAPS`.
- The detector is work in progress and more forms are coming. The scored numbers are a ratchet, not a
  target: a new form that disagrees with a rule here is evidence, not noise.

## Acceptance

- [x] The 12 ground-truth cells above are detected.
- [x] No scored form's recall drops; gains re-recorded in `corpus/scoring/baselines.json`. itc101
  precision is the one deliberate drop, with its reason recorded there and in FORM-13.
- [x] A `formCells.test.js` case pins a table row with a stray rule beside it.
