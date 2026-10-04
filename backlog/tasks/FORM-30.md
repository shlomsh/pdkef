---
id: "FORM-30"
title: "Score Bituach Leumi BL/211 in the benchmark"
status: "done"
priority: "P2"
epic: "form-detection"
depends_on: []
---

# FORM-30 · Score Bituach Leumi BL/211 in the benchmark

## Why

The scored corpus has two Hebrew forms, and both come from the same kind of source. BL/211 (National
Insurance work-injury claim, 05.2015 edition) is a third. It is a flat Microsoft Word 2010 export: no
AcroForm, a text layer, Wingdings checkbox glyphs, open-top tick combs for ID numbers and dates, and
underline leaders after labels. No form in the corpus was made by Word, so this one tests whether the
detector's rules hold on a different producer.

## Acceptance

- [x] The PDF is committed as issued (`scoring/forms/btl-bl211-2015.pdf`, sha256 `f8ed49ed...`).
- [x] Reviewed ground truth for PDF page 2 (pageIndex 1, printed 1 of 8, the claimant details) and PDF
  page 7 (pageIndex 6, printed 6 of 8, the employer section), annotating what the form is and not what we
  detect, checked on an overlay.
- [x] One `baselines.json` row per page, recorded with `scripts/score-form.mjs`, with what it missed
  named in the row's note.

## Result (2026-10-04)

| Page | Targets | Recall | Precision | Labels |
| --- | --- | --- | --- | --- |
| p2, claimant details | 62 | 64.5% | 30.1% | 87.5% |
| p7, employer section | 86 | 39.5% | 75.6% | 94.1% |

The misses are four detector gaps, each named in its row's note: underline leaders typed as `_`
characters get no candidate (the largest, on both pages); a ruled cell about 23pt tall is reported as a
one-line strip at its top and falls under IoU 0.5; open-top tick combs surface as two or three stacked
combs plus checkbox-kind squares at their end ticks (most of p2's false positives); and in the salary
table only the first row's cells are found.
