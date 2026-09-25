---
id: "SNG-13"
title: "A fillable PDF names its fields in its own words: /TU, else a readable /T, else no name"
status: "retired"
priority: "P2"
epic: "sign-next-gen"
phase: "near-term"
depends_on: []
---

# SNG-13 · A fillable PDF names its fields in its own words: /TU, else a readable /T, else no name

*Retired 2026-09-25:* no field names are shown under the raster-first premise. Revisit only if fillable PDFs get their own path (guidelines §12 #20).

*Filed 2026-09-25.* Under the next generation's rules, a field name is shown only when the file itself says
it (`docs/sign-next-gen-guidelines.md` §1). That covers:
- the walk's "2 of 12, ID number" on a fillable PDF (canvas frame F7);
- a review tag;
- the accessible name VoiceOver reads.

No code reads `/TU` today. A grep of `src/tools/sign/fields/` on d7f8c817 finds it only in corpus notes. So
the fields detected best, which are a fillable PDF's widgets, are the ones that carry no name at all.

**The corpus shows the spread:**
- The I-9 has a `/TU` tooltip on all 128 fields, and readable `/T` names (`Signature of Employee`).
- The 1040 (2024) has no `/TU`, and opaque names (`topmostSubform[0].Page1[0].f1_01[0]`).
- ล.ย.01 has one `/TU`, on its excluded clear button, and generated names (`Text1`, `Radio Button3`).

## What to build

In the widgets source, return a label:
- from `/TU` when present;
- otherwise from `/T` only when it reads as words, not an auto-generated name or an XFA path;
- otherwise none.

Never guess from geometry here. That is FORM-03's separate problem.

## Acceptance

- [ ] On the I-9, every page-1 field's label equals its truth label.
- [ ] On the 1040 and ล.ย.01, no field gets a label from an auto-generated name.
- [ ] Labels are scored per form in `score-form.mjs`, and the purity guard stays green.
