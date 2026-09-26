---
id: "FORM-27"
title: "An open comb's field is its printed row: teeth never split their own cell, and a lone comb takes its title line's height"
status: "done"
priority: "P1"
epic: "form-understanding"
phase: "near-term"
depends_on: ["FORM-26"]
---

# FORM-27 · An open comb's field is its printed row

## Why

Shlomi, 2026-09-26, fill mode (`/sign/?next=1`) on form 101 page 1:

1. Section ג, the children table. Each row is 21.9pt tall, but the מספר זהות and תאריך לידה slots
   are framed on the comb's 7.2pt tick strip only, about a third of the printed cell. The שם column
   beside them is framed on the whole row.
2. The tax year comb (שנת המס) at the top of the page: the same short frame. Its height should come
   from the title printed on the same line; the comb is part of that title.

Measured with the pure detector (points, y down from the page top):

| Region | Detected box | Printed cell |
| --- | --- | --- |
| ID, row 1 | x 346.9-448.8, y 395.0-402.2 (7.2pt), no `writable` | x 346.9-448.8, y 380.3-402.2 (21.9pt) |
| Birth date, row 1 | x 255.6-346.9, y 395.0-402.2 (7.2pt), no `writable` | x 258.0-346.9, y 380.3-402.2 (21.9pt) |
| Name, row 1 | x 448.8-520.1, y 380.3-402.2 (21.9pt) | same |
| Tax year | x 220.4-285.3, y 91.4-99.4 (8.0pt), no `writable` | no cell; title "שנת המס" y 81.5-95.5 |

## Cause

The contract already says the right thing: an open comb's own bounds are its teeth run (they carry
the pitch, and the scored ground truth is the strip), and `writable` is the printed cell around it,
which `placeCombOnRegion` places the digits by and the fill slot frame outlines
(`region.writable ?? region`). `fieldRegions.js`'s `absorbWritable` sets it from the tightest
enclosing cell.

1. Table: FORM-26 regressed it. The comb's own teeth rise 7.2pt of a 21.9pt band (0.33), past
   `MIN_FLOOR_RISE_FRACTION` (0.3), so `buildClosedCells` reads every tooth as a floor tick and
   chops the ID and date columns into per-digit slivers. Those have no caption below and are
   dropped, so no cell encloses the comb and it loses `writable`. With the floor-tick rule off the
   comb gets the 21.9pt cell back.
2. Tax year: there never was a cell. The comb stands alone beside its title.

## Decision

Keep the contract (bounds = teeth, `writable` = the printed field); fix what feeds it:

1. Floor ticks divide a ruled column only when they divide it into captioned fields. The wall-bounded
   column is built too, and it stands unless a captioned floor-ticked column inside it survives.
2. An open comb no cell encloses takes `writable` up to the top of the text printed on its own line,
   right beside it (within one cell pitch).

## Done when

- The children table's ID and date combs carry `writable` = their row's cell; the tax year comb
  carries a `writable` reaching the title's top.
- Element-corpus rows pin both shapes.
- No scored form's recall or precision moves down.

## Result (2026-09-26)

Landed. `buildClosedCells` also builds the wall-bounded column around floor ticks (`tickDivided`),
and `detectCellCandidates` keeps it unless a captioned floor-ticked column inside it survives, so the
address row still splits and a comb's teeth no longer delete their cell. `combTitleLine.js` gives an
open comb no cell encloses a `writable` up to the top of a text run on its own line: beside it within
one cell pitch, not a checkbox's own glyph (form 101 prints its boxes as an "o"), and only when the
teeth are at most 0.75 of the run's height (ภ.ง.ด.90's 0.91 amount boxes stay as they were).

Measured on all ten scored forms: the only changed regions are form 101's 26 table combs and its
start-date comb (the row cell back as `writable`, as before FORM-26) and its tax year (`writable`
y 81.5-99.4). Every recall and precision count is unchanged. Digits follow `writable` as
`placeCombOnRegion` already intends (Shlomi chose this over keeping them on the teeth): at 10pt the
table's ID sits on the name's baseline again (box top 392.3 -> 386.0pt) and the year on its title's
(89.5 -> 85.2pt). Element corpus: three rows (teeth in a ruled column, teeth beside a title, text on
the line above); the first two fail on the old code.
