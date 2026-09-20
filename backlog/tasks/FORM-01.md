---
id: "FORM-01"
title: "Tell a caption from a field, and take form 101 to the 90% gate"
status: "open"
priority: "P1"
epic: "form-understanding"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# FORM-01 · Tell a caption from a field, and take form 101 to the 90% gate

## Why

After MOBI-11's tick-column work (2026-09-20) form 101 scores **82.0% recall / 92.7% precision /
80.7% labels**; the health form is 86.7 / 94.2 / 96.9. The gate for an automatic question flow is
90 / 90 / 85. Eleven more fields on form 101 reach it, and there is only one class left with room:

| kind | targets | recall | precision |
| --- | --- | --- | --- |
| checkbox | 62 | 87.1% | 100.0% |
| comb | 20 | 100.0% | 100.0% |
| date | 24 | 95.8% | 83.3% |
| text | 30 | **53.3%** | **36.4%** |
| signature | 3 | 33.3% | 100.0% |

`text` is both the biggest recall hole (14 misses) and the whole of the precision cost (7 of the 9
false positives). Both ends are the same problem, named as failure class 1 in
`scripts/spike/mobi-10/report-cells.md`: **a short caption beside a checkbox sits in its own grid
cell with enough padding to pass the blank-strip test, and nothing geometric separates it from a
short label with a real input area next to it.** `הכנסה אחרת` and `עבודה/קצבה/עסק` are the worked
examples.

## Scope and acceptance

The signal `report-cells.md` proposes and nobody has tried: **proximity to a checkbox, as a
caption rather than as an overlap.** Today a cell is skipped only when it *overlaps* a detected
checkbox (`reconcileFields`); a caption cell sits *beside* one and survives. A cell whose row
carries a checkbox in an adjacent column, and whose own text is short, is that checkbox's caption,
not a field.

- [ ] Add the caption rule and measure it, both forms, IoU >= 0.5, with `score.mjs`. Precision on
  `text` has to move materially off 36.4% without costing checkbox or comb, which are at 100%.
- [ ] Attack the 14 `text` recall misses separately from precision; they are not the same cells.
  Failure classes 4, 5 and 6 (a field with no ink at all, an inline blank mid-sentence, a dotted
  leader read as many small cells) are **out of scope here** and need different signals, not
  tuning. Say which of the 14 fall into them rather than chasing all 14.
- [ ] Unit fixtures for every rule added, in `formCells.test.js`, in the style of the tick-column
  tests: a synthetic ink page, not a real form.
- [ ] Re-score and put the numbers in `docs/mobi-10-field-map-spike.md`.

**Reproducing the score needs the two source PDFs**, which are not committed and cannot be (no
reuse grant; see `scripts/generate-form-grid-fixtures.mjs`). Their URLs and sha256 are in the spike
record, the tooling takes `--input <path>`, and the committed geometry-only fixtures are
byte-faithful for the pure-ink path but carry **no text at all**, so they cannot exercise
`formCells.js` or `fieldLabels.js`.
