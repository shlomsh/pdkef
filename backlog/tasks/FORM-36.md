---
id: "FORM-36"
title: "Add BTL 1500 (05.2026) to the scored corpus: a held-out Hebrew Word form"
status: "in_progress"
priority: "P2"
epic: "form-detection"
horizon: "now"
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

- [ ] `forms/btl-1500-2026.pdf` committed as received (sha256 `bcf2e881...4ae3`), blank, no personal data.
- [ ] One truth file per page with fields, `ground-truth/btl-1500-2026-page<N>.json`, in
  `scripts/spike/mobi-10/CONTRACT.md`'s shape, annotated as what the form is, never from our
  detectors' output, following the conventions of the existing BTL and health truths.
- [ ] Shlomi checks each page's overlay (`scripts/spike/mobi-10/overlay.mjs`) before it counts.
- [ ] Baseline rows recorded in `baselines.json` with today's detector on `main`, read before written.
