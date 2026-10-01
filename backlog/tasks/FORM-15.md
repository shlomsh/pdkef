---
id: "FORM-15"
title: "1040 amount boxes the form leaves blank read as fields"
status: "done"
priority: "P3"
epic: "form-detection"
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

## 2026-10-01 done

Measured on every scored form (`node scripts/score-form.mjs --all`, text runs and widgets both read).

- Printed text. The line 6c row has no line number printed in its answer column, and line 1i has its
  "1i" label in the middle column (x 396) rather than at x 488, where 1g, 1h, 1z, 6b, 7 and 8 carry theirs.
  But the "(see instructions)" wording that sits on both rows is also on line 1h, a true box, so the
  words separate nothing, and a missing-line-number rule is a 1040 column layout, not a general fact.
  Not pursued.
- Fill and geometry: already ruled out under FORM-13 (white fill, same size, same ruling).
- Widget layer, any type (`/Tx`, `/Ch`, `/Btn`, `/Sig`). Four scored forms declare widgets. Of their
  drawn cells before reconcile: 1040 66 of 68 have a widget over them (the two that do not are exactly
  lines 1i and 6c, overlap 0.00; wired ones measure 0.86 or more), pnd90 388 of 388 (0.89 or more),
  I-9 38 of 38 (0.39 or more), lor-yor 0 drawn cells. Every flat form has no widget at all.
  A naive "no `/Tx` widget under a drawn cell" rule costs the I-9 its State box (a `/Ch` dropdown,
  which `detectWidgetRegions` does not read), so the rule has to count widgets of any type.

Decision: a rule, not a recorded false positive. A drawn cell that no widget touches (under 0.3 of its
area covered) is dropped when at least 90% of the page's drawn cells are wired to a widget
(`dropUnwiredCells` and `widgetFootprints` in `formWidgets.js`, called from the ink source in
`detectFormFields.ts`; the line pass still sees the dropped cells as ground). Scored result: 1040
candidates 90 to 88, precision 97.8 to 100, recall 100 unchanged; the other eight forms unchanged to the
recorded count. A page with no widgets, or whose widgets sit beside the printed boxes, passes through
whole. Pinned by three element-corpus rows (wired page drops its blank box, a 4-of-5 page keeps all,
a `/Ch` dropdown counts as wiring) and a unit block in `formWidgets.test.js`.

Caveat on the evidence: the 1040's truth is derived from the same widgets the rule reads, so the 100%
there is structural. What is measured independently is that no other scored form loses a field to it.
