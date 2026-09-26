---
id: "FORM-26"
title: "Ticks rising from an underline divide a row into columns"
status: "done"
priority: "P1"
epic: "form-understanding"
phase: "near-term"
depends_on: []
---

# FORM-26 · Ticks rising from an underline divide a row into columns

## Why

Form 101's private-address row (targets `t013` city, `t014` house number, `t015` street) is never
found (reported 2026-09-26). The block is one ruled box with an inner underline: you write above the
underline, the captions (רחוב/שכונה, מספר, עיר/ישוב, מיקוד) sit in a thin strip below it, and the
columns are divided by short ticks rising from the underline, about 7pt into a ~20pt writing band.

Two stacked causes, measured on current main:

1. `buildClosedCells` (`formCells.js`) accepts a vertical as a column edge only when it spans the
   whole band, so the ticks are ignored and the band becomes one wide lone cell.
2. The postcode comb sits ~94% inside that cell, so `reconcile` (`fieldRegions.js`,
   `CLAIM_CONTAINMENT` 0.6) deletes the whole cell. Nothing in the row survives.

FORM-01 recorded cause 2 as "undivided row, cell claimed by a comb"; cause 1 is why it was undivided.

## Decision

Fix cause 1 at the root: a vertical standing on a band's floor rule and rising a meaningful share of
the band is a column divider. Do not loosen `CLAIM_CONTAINMENT`: once the row is split, the comb
claims only its own cell.

## Done when

- `t013`-`t015` match on `itc101`; its baseline is re-recorded with a note saying why.
- An element-corpus row pins the shape (ticks on an underline split a band).
- No other scored form's floor drops.

## Result (2026-09-26)

Landed. `buildClosedCells` reads a tick rising at least `MIN_FLOOR_RISE_FRACTION` (0.3) of a band
from its floor as a column edge; such a column publishes one line on the floor, labelled by the
caption printed below it (`captionBelowFloor`), and is dropped when there is none. Measured: the
real ticks rise 0.330 of the band, the tallest floor noise 0.239. `floorTicked` is set only when the
tick exemption actually admitted a wall, which kept irs-1040-2024 unchanged.

The ground truth for `t013`-`t015` was wrong, not the detector: it split city/number at 174pt, where
nothing is printed, and ran the street box to 540pt, into the passport column. Snapped to the printed
ticks (108.44, 202.61, 228.79pt) and the box wall (392.5pt), verified on a rendered overlay.

itc101 recall 94.2 -> 96.4, precision held at 97.8; no other scored form moved. The element corpus
pins the shape (captioned, too-short ticks, uncaptioned).
