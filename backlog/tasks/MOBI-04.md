---
id: "MOBI-04"
title: "Tap a detected comb run and type the whole number once"
status: "done"
priority: "P1"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-03"]
legacy_state: "Done"
---

# MOBI-04 · Tap a detected comb run and type the whole number once

## Scope and acceptance

**The editor already knows how to draw one character per ruled cell; it just has no idea where the
cells are.** `src/editor/text/comb.js` exists precisely for this, and its module doc describes the
situation in as many words: pre-printed forms rule the paper into boxes whose pitch was decided before
anyone chose a font, so laying characters out by font advance can never line up. It owns the
cell-centre math for both the editor and the exporter. What it lacks is a source for the pitch, which
today only arrives by a person dragging a side handle to set `width` by eye.

MOBI-03 supplies exactly that. Page 1 of income tax form 101 carries 17 comb runs covering 184 cells
at a measured 11.4pt pitch. Filling the identity number, the two dates, the phone numbers and the
deductions file number on that page today means either placing a separate text element per cell or
dragging one box until nine digits happen to land in nine boxes, on a phone, zoomed in, for each of
17 fields. That is the single most expensive thing in the whole round trip and it is what makes people
give up and go find a printer.

Make a detected comb run a tappable target that creates a comb text element already sized and
positioned to the run, so the user taps once and types `312456789`. The pitch and cell count come from
the detection, not from a drag.

Constraints that are not negotiable. The created element must be an ordinary text element with `width`
set, so `isComb` stays derived from `width` and does not gain a second source of truth. It must route
through the existing creation path so undo, draft persistence, and the export registry all work
unchanged. It must respect the one-shot tool arming model: tapping a detected region is a new
interaction and must not leave a tool armed, and must not make the click-after-a-placement do
something other than deselect. Direction defaults follow the existing text rules rather than being
guessed from the region.

**These are Hebrew RTL forms, and that is the point rather than an edge case.** Both evidence forms
are Hebrew. A comb run filled with digits is direction-sensitive at its boundaries, and the repo's
existing rule that RTL text boxes grow leftward from a fixed right edge has to hold for a comb whose
extent is fixed by the paper. Prove it on the real fixtures, not on a synthetic LTR case.

**Acceptance.** On the committed form 101 fixture, one tap on the identity-number run followed by
typing nine digits places all nine digits centred in the nine printed cells, verified against the
detected cell centres rather than by eye. The same holds for a date run and a phone run. The exported
PDF agrees with the editor on every cell centre, since `comb.js` is the single owner of that math and
both sides call it. Undo removes the element in one step. A restored draft reproduces the same
geometry. Hebrew and digits in the same run land correctly at the run boundaries.
