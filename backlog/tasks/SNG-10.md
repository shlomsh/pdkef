---
id: "SNG-10"
title: "Practice form v2: the sketches' Employee details form becomes the app's own example form"
status: "open"
priority: "P1"
epic: "sign-next-gen"
phase: "near-term"
depends_on: []
---

# SNG-10 · Practice form v2: the sketches' Employee details form becomes the app's own example form

*Filed 2026-09-25* from Shlomi's note on the SNG-02 canvas: "the form you used for the design can be a new
version of our own example form in the app, it is much richer".

**Today's practice form** is a fictional field-trip permission slip:
- 680×500 pt, with 9 AcroForm fields: four text fields, a 9-digit comb, two checkboxes, a signature and a date.
- Its words and fields live in `src/tools/redact/practiceFormContent.js`.
- `scripts/generate-practice-form.mjs` renders it to `public/images/redaction-guide/sample.pdf`.
- The home page's dropzone (`src/site-lib/FileDropzone.tsx`, `toolTarget="sign"`) fetches it as "PDkef practice form.pdf", the try-it sample that opens Sign. It sits under `redaction-guide/`, and its content under `src/tools/redact/`, for history: Redact itself loads no sample today.
- It is the corpus form `pdkef-practice-form`, which scores 88.9% recall and 88.9% precision today.

**The v2 form** is the one every SNG-02 sketch draws: "Employee details", in three sections.
- Personal details: full name, ID number (9-cell comb), date of birth, phone, street address, city, and postal code (7-cell comb).
- Employment: employer, start date, and two checkboxes.
- Declaration: a short paragraph, a signature line, and a date line.

It is fictional and carries no real data, with the same disclaimer as today.

Why it matters beyond looks:
- It has every kind the next generation handles: text, combs, dates, checkboxes, a signature line, and a date line with no box around it.
- It becomes the canonical fixture for SNG-05's surface and SNG-07's Simulator smoke run.
- The sketches and the product then share one form.

## Open questions for Shlomi

1. **Fillable (AcroForm, like today) or flat vector?**
   - Recommendation: flat vector, scored 100/100 in the corpus. It teaches the rule that works on every form (tap to write, plus the spots we found), and it exercises the detection path most real forms take.
   - A fillable twin can stay a test fixture for the counted path (canvas frame F7).
2. **A Hebrew twin** as the `/he/` practice form, drawn RTL, so the walk's order and the comb cells are checked on an RTL document.
3. **Redact.** Should Redact gain a sample for the first time: the same form, filled with the sketches' sample values, since a filled form has something to redact?

## Scope

- Move the content module out of `src/tools/redact/` to where its consumers live (`docs/module-boundaries.md`).
- Generate v2 from the content module, as today.
- Regenerate its ground truth (the `practice-form` entry in `scripts/generate-live-form-truth.mjs`) and re-record its baseline.
- Audit every e2e spec that loads `sample.pdf`. Keep v1 as a fixture where a spec depends on its geometry.
- Re-shoot the how-to-sign screenshots (iPhone, Android, Mac content pages) that show the practice form.

## Acceptance

- [ ] Shlomi answers the three questions above; the answers are recorded here.
- [ ] v2 is generated from its content module, and detection scores it 100/100 in the corpus (or matches its widgets exactly, if fillable).
- [ ] The home page's sample loads it (and Redact's, if question 3 says so), and every e2e spec is green, including `field-nav-arrow-direction.spec.js`, which loads `sample.pdf` today.
- [ ] The content pages' screenshots show v2.
