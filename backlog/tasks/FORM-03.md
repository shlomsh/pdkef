---
id: "FORM-03"
title: "Take label association to the 85% gate, starting with the column header a tall table's last row cannot reach"
status: "done"
priority: "P2"
epic: "form-detection"
depends_on: []
---

# FORM-03 · Label association to the gate; first, the header a tall table's last row cannot reach

## Why

`headerAbove` in `src/editor/adapters/pdf/formCells.js` searches up to `HEADER_SEARCH_HEIGHT`
(220pt) for the text that labels a blank cell. Form 101's children table is **13 rows of ~22pt,
about 286pt tall**, so its lowest rows cannot see their own column header at all.

Measured: MOBI-11's tick-column change added 18 correct candidates and label association fell
**83.3% -> 80.7%** on that form, entirely because of this. The fields are right; the names are
missing. Label association is a gate criterion in its own right (85%), so this is not cosmetic.

## Label association now lives here (2026-09-25)

FORM-01 closed on form 101's recall and precision gate (94.2 / 97.8 after FORM-12 and FORM-13) and
handed this ticket the one gate criterion still short: **label association, last measured at 83.2%
against 85** on 2026-09-20. It has not been measured since. FORM-12 found 12 more cells in the
children table and FORM-13 dropped three captions, and both change what is labelled, so 83.2 is a
starting guess, not a baseline. The `headerAbove` reach below is the biggest known cause, not the
only one: FORM-14 (a caption centred in its cell is a heading, not a label) is another.

- [x] **Measure first.** Re-score labels on both forms on today's code with the
  `scripts/spike/mobi-10/` chain (extract -> cells + label -> union -> score), not `score-form.mjs`,
  which runs `formCells` with no text and prints no label figure (FORM-01's caution).
- [x] **Stop it drifting unseen.** Record a label figure per form in
  `corpus/scoring/baselines.json` as a ratchet like recall and precision, so the scored corpus fails
  when label association drops.
- [x] Form 101 reaches 85% label association with recall and precision held, and the health form
  stays at or above its measured figure.

## Scope and acceptance

- [x] Raising the constant is the obvious move and probably the wrong one on its own: 300pt of
  vertical reach on a page with no table would pull in unrelated text. Prefer a rule that follows
  the structure the detector already recovers, for example searching to the top of the current
  table's own run of row bands rather than a fixed distance in points.
- [x] Whatever the rule, it must not lower label association on the health form, which is at
  96.9%.
- [x] Unit fixture in `formCells.test.js` with a tall stack of row bands and one header above it.
- [x] Re-score both forms and record the label numbers in `docs/mobi-10-field-map-spike.md`, adding
  the FORM-12 and FORM-13 rows its score table is missing.

From FORM-04: only Hebrew signature/date keywords exist (formCells.js); Latin labels need their own.

## 2026-10-01 board cleanup

- Priority P1 -> P2.

## 2026-10-01 done

Measured first, with the MOBI-10 chain at the FORM-12 and FORM-13 commits (83.2% on form 101, 96.9%
on health, the ticket's own figures) and with `scoreForm` on today's code, because the chain no longer
runs after ARCH-24. **Form 101 was at 58.2%, not 83.2%** (78 of 134 labelled pairs); health 96.9% (63/65).

The reach of `headerAbove` was the cause of 9 of the 56 misses. The biggest cause was another: since
SNG-09 shrank a Zapf Dingbats checkbox to its printed square, the glyph that draws it ("o", "q") was no
longer inside the candidate's box and became the first word of 37 labels. Both fixed:

| form 101 labels | correct | rate |
| --- | --- | --- |
| before | 78 / 134 | 58.2% |
| glyph kept out of the label (`fieldLabels.js`, `isOwnGlyph`) | 106 / 134 | 79.1% |
| + a stack of row bands reaches its header (`formCells.js`, `stackRise`) | 115 / 134 | **85.8%** |

Health is unchanged at 96.9%, and `score-form.mjs --all` shows recall, precision and every count
unchanged on all ten forms. The reach follows the table the detector recovered (the cells abutting in
the cell's own column), not a longer fixed distance, so a cell with nothing stacked above it searches
as before.

Ratchet: `baselines.json` records `labels: {rate, evaluated, correct}` per form (`null` for the 1970
1040 and the Thai LOR YOR 01, which grade no pair), checked by `scoring.test.js` and `score-form.mjs
--all` with the same SLACK and exact counts as recall and precision. Also re-recorded the practice
form's stale sha256 (the pdf-lib bump regenerated `sample.pdf`; counts unchanged), which made `--all`
fail provenance at HEAD. Spike doc: FORM-12 and FORM-13 rows and today's rows added.

Left: no element-corpus row, which deliberately carries no text (`detect.js`). 19 form-101 label
misses remain, listed in the spike doc's addendum.
