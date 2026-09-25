---
id: "SNG-10"
title: "Practice form v2: the sketches' Employee details form becomes the app's own example form"
status: "done"
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

## Shlomi's answers (2026-09-25)

1. **Flat vector, not fillable.** It teaches the rule that works on every form (tap to write, plus the spots we found), and it exercises the detection path most real forms take.
2. **No Hebrew version.**
3. **No Redact sample:** "there is no complexity there".

## Scope

- Move the content module out of `src/tools/redact/` to where its one consumer lives (`docs/module-boundaries.md`).
- Generate v2 from the content module as a flat vector PDF: drawn lines, boxes and combs, no AcroForm widgets.
- Its ground truth can no longer come from widgets (`generate-live-form-truth.mjs` reads widgets). Generate it from the content module's own layout, every drawn field's rect and kind, and re-record the baseline.
- Audit every e2e spec that loads `sample.pdf`. Keep v1 as a fixture where a spec depends on its geometry.
- Re-shoot the how-to-sign screenshots (iPhone, Android, Mac content pages) that show the practice form.

## Acceptance

- [x] Shlomi answers the three questions; the answers are recorded above.
- [x] v2 is generated from its content module as a flat form, and detection scores it 100/100 in the corpus, every spot above the precision floor (SNG-11).
- [x] The home page's sample loads it, and every e2e spec is green, including `field-nav-arrow-direction.spec.js`, which loads `sample.pdf` today.
- [x] The content pages' screenshots show v2.

## Done (2026-09-25)

- **The form.** `scripts/practice-form-content.mjs` holds the words and the layout; `npm run generate:practice-form`
  writes `sample.pdf`, its ground truth and the home page's thumbnail from it, byte-deterministic, and
  `scripts/generate-practice-form.test.mjs` fails if the committed files drift. A4, flat, no `/AcroForm`.
  Branded from `global.css`'s own tokens (read at generation time, never copied) with the logo and wordmark.
- **Detection: 13/13, 100% recall and precision**, with no drawing tricks. Two detector changes earned it, and
  no other corpus form moved: `formLines.js` reads an open signature or date line by its caption, and
  `formCells.js` accepts a lone box when it is empty and a short caption sits right on it. SNG-11's floor is
  not built yet; at 100% raw precision every spot clears it.
- **The current editor counts 12**, not 13: MOBI-11 keeps signature cells out of Sign, so the signature line is
  found but not marked. `useFormFieldRegions.practiceForm.test.tsx` pins that. How a found signature line is
  offered is SNG-05's to decide.
- **v1** is frozen at `src/tools/sign/fields/__fixtures__/practice-form-v1.pdf`, the corpus's live-AcroForm
  case. Every e2e spec that loads the sample holds on v2 unchanged.
- **Screenshots**: all three how-to-sign images re-shot on the current build (English and Hebrew pages).
- **Follow-ups:** MOBI-18 retired as superseded; DEMO-08 closed (the hero demo keeps its field-trip story).
  The review's other point, a caption to the right of a line on an RTL form, is not read yet.
