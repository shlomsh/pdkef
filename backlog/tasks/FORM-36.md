---
id: "FORM-36"
title: "Add BTL 1500 (05.2026) to the scored corpus: a held-out Hebrew Word form"
status: "done"
priority: "P2"
epic: "form-detection"
depends_on: []
---

# FORM-36 · Add BTL 1500 (05.2026) to the scored corpus: a held-out Hebrew Word form

## Why

Shlomi, 2026-10-08: add the unemployment claim form (בל/1500, 05.2026 edition, 7 pages, supplied as
`T1500.pdf`) as a benchmark. It is flat (no AcroForm), Hebrew, typeset in Word, and dense with the
patterns the corpus is thin on: underscore blanks (71 underscore runs across pages 2-7), comb rows,
date combs, `☐` checkboxes and table cells. Published in 2026, it postdates CommonForms, so it is also
the held-out page FORM-33 asked for, and the honest test of FORM-34's underscore and table rules.

## Scope and acceptance

- [x] `forms/btl-1500-2026.pdf` committed as received (sha256 `bcf2e881...4ae3`), blank, no personal data.
- [x] One truth file per page with fields, `ground-truth/btl-1500-2026-page<N>.json`, in
  `scripts/spike/mobi-10/CONTRACT.md`'s shape, annotated as what the form is, never from our
  detectors' output, following the conventions of the existing BTL and health truths.
- [x] Shlomi checks each page's overlay (`scripts/spike/mobi-10/overlay.mjs`) before it counts.
- [x] Baseline rows recorded in `baselines.json` with today's detector on `main`, read before written.

## 2026-10-08 result

Truth for pages 2-7 (424 targets; page 1 is instructions), checkbox bounds normalised to the printed square
(FORM-31's convention), overlays checked by Shlomi. Baselines recorded with FORM-34 in:

| Page | Targets | Recall | Precision | Labels |
| --- | --- | --- | --- | --- |
| 2 | 52 | 59.6 | 43.7 | 83.9 |
| 3 | 19 | 26.3 | 17.9 | 80.0 |
| 4 | 78 | 29.5 | 18.1 | 60.9 |
| 5 | 24 | 29.2 | 28.0 | 71.4 |
| 6 | 67 | 47.8 | 28.3 | 78.1 |
| 7 | 184 | 92.4 | 93.4 | 46.5 |

The biggest single gap is the checkboxes: 95 targets, almost none matched, because the detector reports the
glyph's cell, not its square (FORM-37). Combs are all found but with many extra candidates (precision 25-45%).
