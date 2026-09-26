---
id: "FORM-27"
title: "An open comb's field is its printed row: teeth never split their own cell, and a lone comb takes its title line's height"
status: "in_progress"
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
