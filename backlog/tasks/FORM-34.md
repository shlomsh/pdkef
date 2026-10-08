---
id: "FORM-34"
title: "BTL page 7: find what FFDetr sees that today's detector misses, and fix it in our own geometry"
status: "done"
priority: "P2"
epic: "form-detection"
depends_on: []
---

# FORM-34 · BTL page 7: find what FFDetr sees that today's detector misses, and fix it in our own geometry

## Why

FORM-33: added next to today's vector detector, FFDetr lifts the 9 flat corpus rows from 85.0% to
93.4% recall at the same precision, and 41 of those 50 extra matches are one page, `btl-bl211-2015`
page 7 (today 45.3% recall / 86.7% precision, with FFDetr 93.0 / 93.0). The model is not shipping
(116MB, possible training overlap, NO-GO on scans), so it is used here once, as a pointer: the targets
it finds and we miss name a gap in our own detector, and the fix belongs in our pure geometry code.

## Scope and acceptance

- [x] List the targets on `btl-p7` that arm A misses and arm AF matches: kind, position, and which
  of our sources should have produced them (ink cells, lines, combs, checkboxes, leaders).
- [x] Name the cause per group from the page's own ink (`collectPageInk`) and text, with an overlay to
  look at. One cause per group, verified against the code, not guessed from the picture.
- [x] Fix the cause in the detector, red test first (a corpus-row ratchet and a focused unit test),
  without a page-specific rule. Every other row holds or improves in `baselines.json`; `btl-p2`'s
  precision (30.1%) is watched, not worsened.
- [x] Record the before/after rows here. FFDetr stays out of the product.

## 2026-10-08 result

The 47 misses on `btl-p7` were three causes, each one line of our code:

1. **Underscore blanks (25).** Word types a blank as `_____`; `formLeaders.js` read only dots. Underscores
   are leaders now, placed inside right-to-left runs and named from the side their script captions from
   (own run, then the nearest run, then the other side, then a caption under the line). Underscores glued
   to letters on both ends (`a_____b`, `MAX_____VALUE`) are not blanks.
2. **Empty table cells far below their header (18).** `resolveLoneBox` dropped an empty cell whose caption
   was more than 12pt above. A column holding four or more empty closed cells now keeps them.
3. **The month cells holding the printed word `חודש` (4): left alone on purpose.** Loosening the own-text
   rule touches every lone box in the corpus, and FFDetr itself scored these below 0.5.

| Row | Recall | Precision | Labels |
| --- | --- | --- | --- |
| btl p7 | 45.3 -> 84.9 | 86.7 -> 83.9 | 92.3 -> 90.4 |
| btl p2 | 64.5 -> 74.2 | 30.1 -> 33.1 | 87.5 -> 89.1 |
| health | 86.7 -> 94.7 | 100 -> 98.6 | 96.9 -> 95.8 |

The other nine rows are unchanged, and no label that was correct before changed. Pages now carry pdf.js's
`dir` in `toPageTextRuns`. A fresh review found no bug in the RTL arithmetic; its two remaining points are
kept on purpose: a full-width underscore line with no caption is still a field (forms use them as writing
lines), and a blank may take the text after it as its label when nothing precedes it.
