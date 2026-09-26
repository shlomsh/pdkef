---
id: "FORM-28"
title: "A comb captioned above in its own box writes in the strip under the caption"
status: "done"
priority: "P1"
epic: "form-understanding"
phase: "near-term"
depends_on: ["FORM-27"]
---

# FORM-28 · A comb captioned above in its own box writes in the strip under the caption

## Why

Shlomi, 2026-09-26, fill mode on form 101: after FORM-27 the personal ID slot fills its box, but the
passport number just below it is still framed on its 5.2pt teeth (y 260.9-266.1), a quarter of its
29.6pt box. Not a FORM-27 regression: it never had a `writable`.

## Cause

The cell detector never publishes the passport box (x 392.5-540.2, y 236.5-266.1): the address box's
inner underline ends against their shared wall, which `buildClosedCells` reads as a junction and
vetoes, and the caption "מספר דרכון (למי שאין מספר ת.ז.)" is longer than `MAX_LABEL_CHARS`. Loosening
the junction veto was measured and rejected: health precision 100 -> 95.6, ภ.ง.ด.90 23.5 -> 17.7, and
it breaks the unit test that pins the health form's junctions.

## Decision

In `combTitleLine.js`, beside FORM-27's title-line rule: an open comb with no cell and no title on its
line, under a rule that spans it (at most 45pt above its floor) with a caption between centred over
it, writes in the strip from under the caption to its floor, when its teeth are at most 0.75 of that
strip.

## Result (2026-09-26)

Across all ten scored forms only two combs change, both on form 101 and both verified on a rendered
overlay: the passport number (`writable` y 244.4-266.1, 21.7pt, in line with the personal ID box
above it) and the deduction-file number (y 164.7-182.6). ภ.ง.ด.90's amount boxes (teeth 0.84 of the
strip) stay as they were. Scores unchanged. Pinned on the real form (`corpus/combRowHeight.test.js`,
fails without the fix) and in `combTitleLine.test.js`.
