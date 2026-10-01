---
id: "SEO-41"
title: "Flatten follow-ups: viewer check of the filled-form fixture, FAQ clause on the two meanings of flatten"
status: "open"
priority: "P3"
epic: "search-and-languages"
horizon: "next"
depends_on: ["SEO-21"]
needs: "Open the filled-form fixture in Chrome's viewer and macOS Preview and say what each showed"
---

# SEO-41 · Flatten follow-ups

Split from SEO-21 when its Part A closed (2026-10-01). See SEO-21's "2026-10-01 decision" for why there is no Flatten inside Redact and no `/flatten/` page yet.

## Scope

- **Viewer check (MOBI-02's pending item, SEO-21 acceptance).** Export the filled-form fixture through Sign and open it in Chrome's viewer and macOS Preview. Record here what each showed. Needs Shlomi.
- **FAQ clause, no new URL.** Add a clause to Redact's FAQ entry "Do I need to flatten the PDF separately?" and to `/blur-vs-blackout-vs-delete-pdf/` naming the two meanings of "flatten": the page becomes an image (Redact), or fields are baked in with the text kept (Sign). Checked against the code, in voice, no em dashes. Run `npm run build && npm run preview` for the CSP pass and the SEO and redirect checks.
- **Test gap.** A widget with no `/AP` that `updateFieldAppearances` cannot repair is untested in `flatten.test.js`.
- **Parked: the `/flatten/` page.** Only after a Keyword Planner absolute-volume read (LOC-14 access) and the SEO-06 gate outcome are recorded. SEO-21's Part B scope is the spec if it is ever built.
