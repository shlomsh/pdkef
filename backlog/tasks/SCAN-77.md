---
id: "SCAN-77"
title: "A folded sheet's traced side flattens as a fold, not a bow"
status: "done"
priority: "P1"
epic: "scan-next"
depends_on: ["SCAN-75"]
---

# SCAN-77 · A folded sheet's traced side flattens as a fold, not a bow

*Opened 2026-11-15* from SCAN-75's phone check. With Fine-tune edges on, a letter folded in thirds came out with the
printed code line along its folded left side leaning about 0.6 degrees (0.70 measured; 0.13 with straight sides).

## Cause

`curvesFromSides` (`src/tools/scan/lib/pageWork/tracedCurves.ts`) fits each traced side with one smooth bend that is
zero at both corners, and the Coons blend in `unitMap` (`src/lib/pageEnhance/dewarp/index.ts`) carries the bend's
slope into the text beside it.

On the letter, most of the lean comes from the corners, not the fold. Its traced left side runs 6 to 10 px off the
chord between the two corners (the bottom-left corner sits a few pixels outside the paper), with a 2 px dip at the
fold. Forcing one bow through both corners turns that offset into a slope along the whole side. Measured through
`measureBend` and `applyPiece`, the code line leans:

| side model | code line lean |
| --- | --- |
| straight sides (corners only) | 0.12 deg |
| one bow through both corners (before) | 0.70 deg |
| two straight pieces meeting at a kink, or the bow, whichever fits better | 0.46 deg |
| the edge's own line, faded to zero over the last trace step before each corner, plus the bow | 0.03 deg |
| that, plus one kink (shipped) | -0.03 deg, kink found at 0.46 on the folded side |

The edge model has to allow for a corner a few pixels off the edge; a fold kink alone does not fix it.

Reusing the automatic path's one-kink test (`foldRms` in `edgeCurves.ts`) to drop such a side is not the fix: on the
22 hand-traced book pages it removed 25 of 62 real curves, and no ratio, kink angle or peak threshold separates the
letter's fold (ratio 0.93, angle 0.70 degrees, peak 1.7 px) from a book side (0.94, 0.69 degrees, 1.8 px).

## Outcome

A side's curve can follow a kink, so a folded side flattens as a fold and a curled side as a curl, with no classifier.

## Acceptance

- [x] Unit tests first, seen failing: a traced side made of two straight pieces meeting at a fold comes back as that
      shape, and a curled side stays a curl.
- [x] The letter's code line leans under 0.2 degrees with Fine-tune edges on (numbers and ids only in the repo).
- [x] No book page's flattening gets worse on the straightness score over the 22 traced pages with their labelled
      corners (text row wobble and slope, and the border's distance from a rectangle), table in this ticket. Met for
      wobble and border; row slope rose on p-002 and p-006, accepted by Shlomi on 2026-11-15 (below).

## The side model, 2026-11-15

`SideCurve` (`dewarp/types.ts`) gains two optional terms for a traced border: `line`, the side's own straight edge
e + f t, faded to zero over `CORNER_RAMP` (1/16, one step of the traced border) before each corner; and `kink`, two
straight pieces meeting at `at`. `curvesFromSides` fits line, bow and kink together by least squares, trying the kink
at every hundredth from 0.1 to 0.9 and keeping the best. The automatic edge finder still returns a plain bow. The
solver moved from `edgeCurves.ts` to `dewarp/leastSquares.ts` so both use one.

Picked over the alternatives on synthetic sides (a true fold, a straight edge off the chord, a tilted one, a curl, a
curl plus an offset): it is the only one of seven candidates that reproduces all five exactly.

## The 22 book pages

Scored from the hand-labelled corners through `measureBend` and `applyPiece`: median absolute slope of the text rows
(degrees), p90 row wobble (output px), and the flattened border's mean distance from a rectangle against the
hand-traced outline (output px). The row numbers are noisy: scaling the old bow by 1 to 3 percent moves a page's
row slope by up to 0.18 degrees, so each number is the mean over the curves scaled by 0.98, 0.99, 1, 1.01 and 1.02.
Pages and ids only; the pages are private.

| page | row slope before | after | p90 wobble before | after | border before | after |
| --- | --- | --- | --- | --- | --- | --- |
| p-000 | 0.02 | 0.02 | 1.12 | 1.10 | 1.0 | 0.8 |
| p-001 | 0.06 | 0.06 | 1.16 | 1.19 | 6.1 | 5.8 |
| p-002 | 0.09 | 0.22 | 1.45 | 1.54 | 1.7 | 0.5 |
| p-003 | 0.04 | 0.03 | 0.99 | 1.05 | 2.6 | 2.4 |
| p-004 | 0.35 | 0.39 | 1.33 | 1.32 | 1.2 | 0.3 |
| p-005 | 0.19 | 0.13 | 1.08 | 1.13 | 3.4 | 2.9 |
| p-006 | 0.08 | 0.15 | 1.12 | 1.08 | 2.4 | 0.7 |
| p-007 | 0.02 | 0.06 | 0.91 | 0.96 | 2.2 | 2.2 |
| p-008 | 0.05 | 0.04 | 0.96 | 0.93 | 5.9 | 5.5 |
| p-009 | 0.07 | 0.05 | 1.06 | 1.03 | 2.4 | 2.1 |
| p-010 | 0.00 | 0.00 | 0.75 | 0.85 | 2.1 | 1.1 |
| p-011 | 0.02 | 0.03 | 0.91 | 0.98 | 5.6 | 5.1 |
| p-012 | 0.02 | 0.00 | 1.00 | 1.11 | 1.3 | 1.2 |
| p-013 | 0.04 | 0.04 | 1.08 | 1.12 | 10.1 | 10.2 |
| p-014 | 0.00 | 0.03 | 0.81 | 0.86 | 2.8 | 2.6 |
| p-015 | 0.04 | 0.03 | 1.18 | 1.14 | 8.4 | 8.2 |
| p-016 | 0.07 | 0.08 | 1.40 | 1.22 | 1.9 | 1.7 |
| p-017 | 0.02 | 0.02 | 1.03 | 0.98 | 13.0 | 12.5 |
| p-018 | 0.03 | 0.02 | 1.14 | 1.09 | 5.6 | 5.1 |
| p-019 | 0.04 | 0.04 | 1.08 | 1.04 | 7.3 | 7.5 |
| p-020 | 0.02 | 0.03 | 0.87 | 1.15 | 6.8 | 6.2 |
| p-021 | 0.09 | 0.08 | 1.86 | 2.09 | 18.2 | 17.4 |

Means: border 5.10 to 4.63 px (3.83 to 3.36 with Shlomi's pins), no page worse on wobble or border. Row slope rises
past the noise on two pages, p-002 (0.09 to 0.22) and p-006 (0.08 to 0.15), the same with pins. On both, the top and
bottom sides now follow the paper close to a corner (their borders go from 1.7 to 0.5 and 2.4 to 0.7 px), and the
row fit on the flattened copy switches its own model there (`explained` or `fans` turns false), which moves its lean.

Review (fresh reviewer, same day): no correctness bug. The line's corner ramp now stays zero past a corner (a bend
can carry the map a little outside the page; it used to keep going at slope 16 and flip sign), test seen failing
first. Noted, not changed: one stray traced point next to a corner can pull the kink there, since the fit has no
outlier rejection; the 22 pages above show no page worse on wobble or border from it.

## Done, 2026-11-15

Shlomi accepted the row-slope rise on p-002 (0.09 to 0.22 degrees) and p-006 (0.08 to 0.15) for the letter's fix and
the squarer borders on all 22 pages.
