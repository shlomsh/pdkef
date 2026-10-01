---
id: "SEO-41"
title: "Flatten follow-ups: viewer check of the filled-form fixture, FAQ clause on the two meanings of flatten"
status: "done"
priority: "P3"
epic: "search-and-languages"
depends_on: ["SEO-21"]
---

# SEO-41 · Flatten follow-ups

Split from SEO-21 when its Part A closed (2026-10-01). See SEO-21's "2026-10-01 decision" for why there is no Flatten inside Redact and no `/flatten/` page yet.

## Scope

- **Viewer check (MOBI-02's pending item, SEO-21 acceptance).** Export the filled-form fixture through Sign and open it in Chrome's viewer and macOS Preview. Record here what each showed. Needs Shlomi.
- **FAQ clause, no new URL.** Add a clause to Redact's FAQ entry "Do I need to flatten the PDF separately?" and to `/blur-vs-blackout-vs-delete-pdf/` naming the two meanings of "flatten": the page becomes an image (Redact), or fields are baked in with the text kept (Sign). Checked against the code, in voice, no em dashes. Run `npm run build && npm run preview` for the CSP pass and the SEO and redirect checks.
- **Test gap.** A widget with no `/AP` that `updateFieldAppearances` cannot repair is untested in `flatten.test.js`.
- **Parked: the `/flatten/` page.** Only after a Keyword Planner absolute-volume read (LOC-14 access) and the SEO-06 gate outcome are recorded. SEO-21's Part B scope is the spec if it is ever built.

## 2026-10-01 progress

- FAQ clause done: Redact's "Do I need to flatten the PDF separately?" (`src/data/tools.js`) and "What does flattening a PDF page do?" on `/blur-vs-blackout-vs-delete-pdf/` now name Sign's gentler meaning. `build`, `test:seo`, `test:csp`, `test:redirects`, `test:css` and `test:weight` pass.
- Test gap done: an unknown-`/FT` widget with no `/AP` rejects with `FormFlattenError` naming "1 of 1"; a widget with no `/FT` at all makes pdf-lib throw inside `updateFieldAppearances`, which is wrapped as a `FormFlattenError` (message is the pdf-lib error, not the count).
- Still open: the viewer check, which needs Shlomi.

## 2026-10-01 viewer check done

Fixture: a generated AcroForm with a text field to fill, a filled text field, a filled text field with its `/AP` stripped, a checked and an empty checkbox, and a blank `/Sig` field. Filled in Sign on build `ec10b15a066e` (live pdkef.com), downloaded as `signed_flatten-check-form.pdf`.

- **macOS Preview:** every value shows, including "No appearance stream" (regenerated) and both checkboxes ticked; the blank signature field shows nothing and the export did not fail.
- **Chrome's viewer:** the same, all values and both ticks present, blank signature field empty.
- **The file:** loaded with pdf-lib, the output has 0 AcroForm fields and 0 annotations on the page, so the answers are page content, not live fields.

Not recorded: clicking into a field or selecting the page text in either viewer (the fields are gone by construction). All three SEO-41 items are done; the `/flatten/` page stays parked as written above.
