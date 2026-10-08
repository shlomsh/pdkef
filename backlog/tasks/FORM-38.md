---
id: "FORM-38"
title: "BTL 1500 labels: list numbers, flipped parentheses, filler and split letters"
status: "done"
priority: "P3"
epic: "form-detection"
depends_on: ["FORM-37"]
---

# FORM-38 · BTL 1500 labels: list numbers, flipped parentheses, filler and split letters

## Why

Since FORM-37 the detector finds all 93 `❑` checkboxes on BL/1500 (05.2026) pages 2-6, but only 60 get the
right label, and 57 matched fields on those pages are labelled wrong in all. Two read-only traces of
`src/editor/adapters/pdf/fieldLabels.js` found four causes (verified on the page's own pdf.js items):

1. **List numbers.** A numbered item reads box, "1", ".", words. `findSameLineTouch` takes the nearest item
   within `TOUCH_GAP` ("1", 0.95 away; the words are 3.68 away) and `growPhrase` refuses the words as too
   wordy, so the label is ". 1".
2. **Parentheses.** `unmirrorParens` flips every paren in every RTL item. That was right for income-tax-101,
   whose items store mirrored parens, but BL/1500's are already logical, so the flip breaks them.
3. **Filler.** `growPhrase` absorbs blank and dash items next to the words ("מתאריך _______ ____", "גרוש/ה –").
4. **Split letters.** pdf.js splits some words into abutting items (gap ~0.01 em, real word gaps ~0.25 em) and
   `assemblePhrase` joins every item with a space ("נ קבה").

## Scope and acceptance

- [x] Each cause fixed generally, red test first: glue abutting items, strip filler at the label's edges, decide paren mirroring by a per-page vote, skip a bare list number
      when words follow it.
- [x] BL/1500 label rates rise; no other row loses a correct label. Re-record the changed rows.

## Outcome

All four fixes are in `fieldLabels.js`, each with a red-first test: `joinChunk` (`GLUE_GAP_EM` 0.1),
`cleanFieldLabel`, the `parensAreMirrored` vote, and `listMarkersBeforeWords`. Recall and precision are unchanged
on every row. Labels:

| Row | Labels |
| --- | --- |
| btl-1500-2026-p2 / p3 / p4 / p5 / p6 | 76.7 -> 86.0 / 47.4 -> 84.2 / 60.4 -> 75.5 / 70.6 -> 76.5 / 81.4 -> 91.5 |
| btl-bl211-2015-p2 / p7 | 89.1 -> 93.5 / 90.4 -> 93.2 |
| health | 95.8 -> 98.6 |
| thai-pnd90-2565 | 6.0 -> 11.9 |
| uscis-i9-2025-01-20 | 60.8 -> 62.7 |

A per-target comparison over all 18 rows finds 0 labels that were right before and are wrong now, and 37 more
right ones. Two I-9 truth labels (t015, t016) paraphrased the printed sentences ("A noncitizen of the United
States." for "A noncitizen national of the United States (See Instructions.)"), and only the old bare "2." and
"3." matched them, as substrings; they now carry the printed text, read from the PDF's own text layer.
A fresh review narrowed three rules before landing: a number is skipped only when its marker chain holds "." or ")"
on the box's own line ("12 חודשים" keeps its 12); an item votes on paren mirroring only by its first and last
paren ("1) הכנסה (שכר)" abstains); and the edge cleanup keeps printed punctuation ("Apt.", "-5", "ת.ז.") while
dropping blanks, dot leaders, separated dashes and trailing colons. `formLeaders.js` keeps its own `cleanLabel`: sharing the new edge set cost btl-1500-2026-p4 one label, since
leader labels keep a trailing dash.

Still wrong, each a different cause: a "כן" box labelled "כן מ" (its own blank's prefix), a box that takes the
neighbour on its far side ("נשוי/אה" for "אלמן/ה"), an item whose blanks flip its direction ("חר א"), and the
date and text fields on pages 4-6 that take a neighbouring caption.
