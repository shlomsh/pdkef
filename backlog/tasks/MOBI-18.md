---
id: "MOBI-18"
title: "The practice form is the benchmark: make it a common form, then hold the editor to looking good on it"
status: "open"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# MOBI-18 · The practice form is the benchmark: make it a common form, then hold the editor to looking good on it

## The decision

Shlomi, on learning that the practice form is the worst case MOBI-17 measured: "our form should
demo a common form. It is ours, therefore predictable. Other forms can be of all shapes and colors
and therefore will look worse. The one we made should look good under normal circumstances and
should be a base benchmark."

That reverses the note MOBI-17 first carried, which treated reshaping the practice form as a way to
hide the problem. The distinction that matters: making the demo *easier than common* would hide it;
making it *common* is what turns it into a benchmark. The editor is then judged against the document
most people actually meet, and any real-world form that fares worse is expected to, not a surprise.

## What "common" is

Today's form is `PAGE_SIZE = [680, 500]` (`practiceFormContent.js:15`): a custom landscape page that
no office prints, wider than either standard portrait sheet, so on a phone it scales *worse* than a
real form does (`358 / 680 = 0.526` against A4's 0.602 and Letter's 0.585). It is not a benchmark
for anything.

Common is a portrait A4 or Letter page with 10-11 pt body text and field cells around 18-24 pt tall.
A4 (595 x 842 pt) is the choice here: both evidence forms in the corpus are A4, it is what nearly
everyone outside the US prints, and Letter is within 3% of it on every number that matters, so a
Letter form inherits the same result. Keep the content - the field trip slip, its nine AcroForm
fields, its checkboxes and signature line - and re-lay it on the new page at those sizes. Field
order and names stay, so `FIELD_NAMES` and every test that reads it are untouched.

## What has to move with it

The form is pinned by hash into the detector corpus, so this is not a drawing change alone:

- `scripts/generate-practice-form.mjs` draws it; `public/images/redaction-guide/sample.pdf` is the
  shipped output. Regenerate, never hand-edit.
- `src/editor/adapters/pdf/corpus/scoring/ground-truth/practice-form-page1.json` records
  `pageSize`, the sha256 and the nine widget bounds. `scripts/generate-practice-form-truth.mjs`
  derives it exactly; run it, do not edit it.
- `src/editor/adapters/pdf/corpus/scoring/baselines.json` holds `pdkef-practice-form`'s ratcheted
  precision and recall (88.9% / 88.9% today, `corpus/README.md:151`). A new layout is a new score.
  MOBI-13's rule is that a ratchet only ever moves up: if the re-laid form scores lower, that is a
  finding about the detector on a common form, and it is fixed before this ticket closes rather
  than baselined down.
- `src/tools/redact/practiceFormContent.test.js` and anything asserting on the header band
  geometry (`generate-practice-form.mjs:94` draws it at the page's full 680 width).
- `src/site-lib/FileDropzone.tsx` draws a page-shaped placeholder (`viewBox="0 0 64 84"`, ~3:4) beside
  the offer. A portrait A4 finally matches it.

## The benchmark, stated

Once the form is common, these are the numbers the editor is held to on it, at a 440 x 956
viewport against a production build, and MOBI-17's acceptance is measured here first:

- Tapping any of its nine fields does not change the apparent size of the editor's own chrome.
- The floating toolbar over a field being typed into is one row.
- Next and Previous are on screen while typing (MOBI-16).
- The field being typed into is clear of the on-screen keyboard (MOBI-15 proves the mechanism).

For reference, the same measurement on today's 680-wide page: every field computes to 6.32 CSS px,
iOS zooms 2.53x, and the toolbar becomes five rows at 110% of the visible height. On an A4 page the
default 12 pt field computes to `12 x 0.602 = 7.2 CSS px`, a 2.2x zoom - better, still failing. So
the re-layout is what makes the benchmark honest; it is not what makes it pass. MOBI-17 does that.

## Acceptance

The shipped practice form is a portrait A4 page with body text and field cells at common sizes; the
corpus truth and baseline are regenerated from it and its score is at or above 88.9% / 88.9%; the
four benchmark lines above are written as the acceptance of MOBI-17 and MOBI-16, and each cites
this form by name.
