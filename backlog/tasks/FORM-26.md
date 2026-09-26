---
id: "FORM-26"
title: "Ticks rising from an underline divide a row into columns"
status: "in_progress"
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
