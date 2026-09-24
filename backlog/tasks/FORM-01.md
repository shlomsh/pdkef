---
id: "FORM-01"
title: "Tell a caption from a field, and take form 101 to the 90% gate"
status: "done"
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

- [ ] ~~Add the caption rule and measure it, both forms, IoU >= 0.5, with `score.mjs`. Precision on
  `text` has to move materially off 36.4% without costing checkbox or comb, which are at 100%.~~
  **Tried and measured 2026-09-20: it removes 0 false positives and 9 true positives. Not done,
  and must not be retried; see below.**
- [x] Attack the 14 `text` recall misses separately from precision; they are not the same cells.
  Failure classes 4, 5 and 6 (a field with no ink at all, an inline blank mid-sentence, a dotted
  leader read as many small cells) are **out of scope here** and need different signals, not
  tuning. Say which of the 14 fall into them rather than chasing all 14.
- [x] Unit fixtures for every rule added, in `formCells.test.js`, in the style of the tick-column
  tests: a synthetic ink page, not a real form.
- [x] Re-score and put the numbers in `docs/mobi-10-field-map-spike.md`.

**Reproducing the score needs the two source PDFs**, which are not committed and cannot be (no
reuse grant; see `scripts/generate-form-grid-fixtures.mjs`). Their URLs and sha256 are in the spike
record, the tooling takes `--input <path>`, and the committed geometry-only fixtures are
byte-faithful for the pure-ink path but carry **no text at all**, so they cannot exercise
`formCells.js` or `fieldLabels.js`.

## Where this stands, 2026-09-20 (second entry: the signal was tried and it is wrong)

**The rule this ticket proposes does not work, and the acceptance box above must not be ticked by
trying it again.** It was implemented and measured on the real source PDFs. Of form 101's 7 `text`
false positives, **zero** have a detected checkbox in their row band, at any overlap threshold.
Of the candidates that are correct, **nine** do - the children table's name cells, which share a
wall (0.0pt gap) with the narrow tick columns. The rule removes 0 false positives and destroys 9
true positives: recall 82.0% -> 75.5%, `text` recall 53.3% -> 23.3%.

The signal is inverted because `report-cells.md` predates MOBI-11. The adjacency it keys on was
manufactured by the tick-column fix three days later. Its two worked examples are also already
solved: `הכנסה אחרת` and `עבודה/קצבה/עסק` are no longer emitted as cells - they survive as labels
on correctly detected checkboxes (`pdfjs-layout-checkbox-0002`/`-0003`, confidence 0.8).

Nor can a threshold separate them. On form 101 the false positives' own-text lengths are 0-19
chars and their blank remainders 38.6-183.9pt; both ranges are strict subsets of the true
positives'. `שם פרטי` appears as both, with cell widths 104.3 vs 103.9pt and blank strips 75.2 vs
74.8pt - **0.4pt apart**. No length, width or remainder cut exists.

### What did work

The precision problem was a box-extent error, not a classification one. Five of the nine false
positives sat on a real target and missed only on IoU (0.442-0.490), so each scored as a false
positive *and* a recall miss - the same cells at both ends, which is why the ticket's instruction
to attack recall and precision separately was wrong for this group.

Landed (`1a692b3`, `8591cb0`): a cell publishes its **writing strip** as bounds, for a
caption-band carve only. Form 101 **82.0/92.7/80.7 -> 85.6/96.7/81.5**, `text` precision
**36.4% -> 81.8%**, checkbox and comb precision unchanged at 100%, health unchanged.

### The 14 `text` recall misses, classified from ink evidence

Only **one** is an out-of-scope class, not the several this ticket assumed:

| class | n | targets |
| --- | --- | --- |
| 4 - no ink at all | 0 | - |
| 5 - inline blank, underline only | 1 | `t027` (41.3pt rule under it, no side or top wall) |
| 6 - dotted leader | 0 | - |
| 7 - table row split by an incidental rule | 4 | `t043`, `t053`, `t058`, `t063` |
| near-miss IoU on a cell built and kept | 6 | `t003`, `t004`, `t005`, `t033`, `t120`, `t121` |
| undivided row, cell claimed by a comb | 3 | `t013`, `t014`, `t015` |

The six near-misses are closed by the landed change. The three `t013`-`t015` are an own-goal worth
its own look: the private-address row is undivided, one wide cell is built for it, and
`reconcileFields` deletes that cell because the postcode comb is >= 60% contained in it
(`CLAIM_CONTAINMENT`).

### What remains for the gate

A row-band fix (a horizontal rule should divide only the x-range it actually covers; today a
left-column rule splits the children table) recovers all 12 of the class-7 targets and takes form
101 to **94.2% recall / 95.6% precision**, checkbox recall 100%. It is written and measured but
**not landed** as of this entry. The reason it was held no longer applies and the next step is to
re-measure, not to re-argue: it dropped two ratcheted precision floors (health 80.2 -> 60.7,
itc101 83.7 -> 77.4) that were measured on text-free fixtures, and the owner rightly declined to
lower them. MOBI-13 then landed the real forms into the scored corpus the same day, so those
floors are now real-form numbers (health 94.2, itc101 96.7) and the fixture artefact is gone.
**Re-run the band fix against the current baselines before proposing any ratchet edit**; on the
real PDFs it cost health only 94.2 -> 90.3 before its own regression fix, and nothing after.

**Labels are the remaining gate gap**: 83.2% against 85, with recall and precision both clear.
Nothing done here attacks label association; it needs work on `headerAbove` / `fieldLabels.js`.

### Two cautions for whoever picks this up

`score-form.mjs` on the real itc101.pdf prints **81.3% / 89.0%** and no label figure, because
`corpus/detect.js` passes `textRuns = []`. That is not a stale record, it is a blind `formCells`.
Use the `scripts/spike/mobi-10/` chain (extract -> cells + label -> union -> score) for any
text-dependent number.

The source PDFs: this ticket said they can never be committed. MOBI-13 records the owner choosing
to commit the originals on 2026-09-20, so check MOBI-13 before repeating the constraint.

## Closed (2026-09-25)

Closed on the recall and precision gate, which form 101 now clears. The two figures above were
the state on 2026-09-20; the band fix this entry calls "written and measured but not landed"
shipped as **FORM-12** (2026-09-22, rows scoped per column), and **FORM-13** (2026-09-24) won back
the precision it cost:

| form 101 | recall | precision | labels |
| --- | --- | --- | --- |
| gate | 90 | 90 | 85 |
| this ticket's last entry | 85.6 | 96.7 | 83.2 |
| `corpus/scoring/baselines.json`, 2026-09-24 | **94.2** | **97.8** | not recorded |

The acceptance boxes: the caption rule is struck, not done (it was the wrong signal); the recall
misses were classified from ink rather than chased; the writing-strip rule carries its unit cases
(`1a692b3`, `8591cb0`); the numbers up to 2026-09-20 are in the spike record, and FORM-12's and
FORM-13's are in `baselines.json`.

**Label association, the one gate criterion still under 85, moves to FORM-03**, which was already
the ticket for the biggest known label loss on this form. Nothing has worked on labels since
`fieldLabels.js` landed on 2026-09-17, and the scored corpus does not record a label figure, so
FORM-03 starts by measuring one. The health form (86.7% recall) is also under the recall gate but
was never in this ticket's scope.

