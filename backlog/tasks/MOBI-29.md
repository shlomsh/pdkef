---
id: "MOBI-29"
title: "A tiny checkbox's resize handles float noticeably past its own corner"
status: "done"
priority: "P1"
epic: "mobile-round-trip"
phase: "quick-win"
depends_on: ["MOBI-27"]
legacy_state: "Done 2026-09-24"
---

# MOBI-29 · A tiny checkbox's resize handles float noticeably past its own corner

## What happened

Reported live right after MOBI-27 shipped, on a real Hebrew declarations form dense with small
checkboxes: "the handles are too far away from the element now." Confirmed via a screenshot showing a
selected checkbox's four corner handles spread across several table rows, and confirmed by the
reporter directly ("Resize handles are too far apart") when asked to narrow down what was wrong.

MOBI-27's fix borrowed `[data-editor-text] .resizer`'s `handle-size + 3px` floor unchanged for
`.symbol .resizer`'s own `--h-spread`/`--v-spread`. That floor is correctly sized for *text*: a
corner handle there only has to clear the side handle sitting fixed at the box's own centre, so the
full `handle-size + 3px` really is the distance between them. A symbol has no side handles - its two
opposing corners (e.g. top-left and top-right) each push out by the floor from centre in *opposite*
directions, so the floor doubles into the actual gap between them, and a checkbox below the floor got
pushed roughly twice as far from its own edge as the non-overlap guarantee needed. Measured on the
same 4.28x4.28px checkbox MOBI-27's own ticket cites: 11px of clearance between adjacent corners (2px
was the target) and every handle floating 5.86px past the box's own edge.

## Outcome (2026-09-24)

Halved the floor in `.symbol .resizer`'s `--h-spread`/`--v-spread` (`(handle-size + 3px) / 2` in
place of `handle-size + 3px`, in `EditorElement.module.css`) - the minimum a symbol's own
corner-vs-opposite-corner geometry actually needs for the same guarantee, rather than text's
corner-vs-centred-side-handle amount. On the 4.28px checkbox this holds adjacent clearance at exactly
3px (still comfortably above the 2px non-overlap floor `resizer-handle-spacing.spec.js` requires) while
pulling every handle back to 1.3px past the box's own edge, down from 5.86px. A normal-size symbol is
unchanged: the natural `half-dimension - 1px` branch already exceeds either floor well before a box
reaches the ~30px crossover the original fix documented, so nothing here moves for anything but a
below-floor symbol. `[data-editor-text] .resizer`'s own floor is untouched - its corner-vs-side-handle
relationship is a different, single-sided distance and is correctly calibrated already.

Verified with real rendered measurements on the same fixture and the real form (income-tax-101-2024.pdf)
the report came from: adjacent-corner clearance holds at 3px on a real detected checkbox in both.
`resizer-handle-spacing.spec.js` gained `expectHandlesNearBox` (MAX_BOX_GAP_PX = 3), applied to the
symbol test - confirmed red against the pre-fix formula (5.86px past the edge on all four handles) and
green with the fix. Text's test is unchanged, since its floor was already correctly sized and this
finding does not apply to it.
