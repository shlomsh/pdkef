---
id: "FORM-16"
title: "Score Thai and English forms in the benchmark"
status: "done"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
depends_on: []
---

# FORM-16 · Score Thai and English forms in the benchmark

## Why

Every rule in the detector has been tuned on two Hebrew forms and two 1040s. FORM-14's caption rule
is on hold because 18 measured captions from two Hebrew forms is a thin base for a ratio, and more
forms are the check against overfitting. Thai is new: left-to-right, no spaces between words,
stacked vowel and tone marks, and dotted leader lines where Hebrew forms rule a box.

## The forms (screened 2026-09-24)

Seven official Thai forms were downloaded and checked for vector ink and a usable text layer. Three
are added:

- **ภ.ง.ด.90** (Revenue Department, personal income tax): a live AcroForm with 353 widgets, so the
  widgets are the truth. Clean embedded fonts with ToUnicode; ำ sometimes splits into its own text
  item but no character is wrong. ID combs, many checkboxes, dotted leaders.
- **ล.ย.01** (Revenue Department, allowance declaration): a live AcroForm with 47 widgets, drawn with
  very little ink.
- **สปส.1-10** (Social Security Office, contribution list): flat, no widgets, landscape. Its legacy
  fonts have no ToUnicode and swap ำ and า in extraction. It is the only candidate with a ruled
  caption row over blank rows, and the detector reads 146 slivers of a dashed leader as
  checkboxes. Truth is annotated by eye.

Not added: ภ.ง.ด.91 (its last page is ภ.ง.ด.90's), สปส.1-01 (drawn almost entirely with
clip-only rects, 0 candidates), ตม.7 and ตม.30 (full-page scans with no text layer).

Two English forms are added from a screen of five US and UK forms: the **I-9** (USCIS, live
AcroForm, 130 widgets, US public domain) and **SA100** (HMRC self assessment return, flat and
comb-dense, the detector finds 357 cells; Open Government Licence v3.0). Not added: I-864 (pdf-lib
cannot load it), DS-11 (only pages 5-6 are the form), CH2 (mostly narrative). No Hindi form
screened had both Devanagari text and usable vector ink; the one genuinely Hindi form (APY) is a
scan with no text layer.

## What the new forms measure (2026-09-24)

| Form | page | targets | recall | precision |
| --- | --- | --- | --- | --- |
| ภ.ง.ด.90 | 3 of 5 | 105 | 52.4 | 23.5 |
| ล.ย.01 | 1 | 57 | 100 | 100 |
| สปส.1-10 | 1 of 4 | 46 | 17.4 | 88.9 |
| I-9 | 1 of 4 | 52 | 98.1 | 92.7 |
| SA100 | TR 4 | 15 | 26.7 | 4.3 |

- **Four detector gaps the Hebrew forms never showed**, each measured on a render:
  - A comb with a bold divider before its last digits (ภ.ง.ด.90's satang group) is split at the
    divider, and the narrow piece is read as a checkbox: all 50 comb misses and nearly all 179
    false positives on that page.
  - A comb drawn as separate painted squares (SA100's amount boxes) is read as one checkbox per
    digit: 88 false positives, 0 of 11 combs.
  - A dotted leader after a label is text, not ink, so no dotted-leader field is found at all
    (สปส.1-10's 30 text, 7 date and 3 signature targets, less the 8 ruled table cells).
  - A checkbox printed as a Wingdings glyph has no ink square (สปส.1-10's 4 checkboxes).
- **A caption row the header rules do not reach**: the I-9's "List A" / "List B AND List C" heading
  row. FORM-13 cannot see it (the rows below hold text). FORM-14's centred-caption test would drop
  both, but "List A" measures 2.55 against its 3x line.
- The two live-form generators became one, `scripts/generate-live-form-truth.mjs`; the practice
  form's and the 1040's truth regenerate byte-identical apart from their provenance line.

## Acceptance

- [x] Each form committed as issued, with its ground truth and a baselines row that says why it is
  here and what its misses are.
- [x] สปส.1-10's and SA100's truth checked by Shlomi against the overlay before their baselines were
  recorded. สปส.1-10's account number is one 10-digit comb, his call.
