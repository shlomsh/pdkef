---
id: "FORM-16"
title: "Score three Thai forms in the benchmark"
status: "in_progress"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
depends_on: []
---

# FORM-16 · Score three Thai forms in the benchmark

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

## Acceptance

- [ ] Each form committed as issued, with its ground truth and a baselines row that says why it is
  here and what its misses are.
- [ ] สปส.1-10's truth checked by Shlomi against the overlay before its baseline is recorded.
