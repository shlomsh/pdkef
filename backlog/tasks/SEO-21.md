---
id: "SEO-21"
title: "Flatten PDF: one shared flattener for forms and annotations, then a tool page that says which kind it is"
status: "blocked"
priority: "P3"
epic: "new-tools-gated"
phase: "longer-term"
depends_on: ["MOBI-02", "SEO-06"]
legacy_state: "Open"
---

# SEO-21 · Flatten PDF: one shared flattener for forms and annotations, then a tool page that says which kind it is

*Re-filed 2026-09-12* from `search-acquisition` into `new-tools-gated`, status `open` to `blocked`: also needs MOBI-02.

## Why this ticket was rewritten (2026-09-12)

The first version framed this as "build the flattening logic once, ship it in two places". That framing
is stale: MOBI-02 shipped the AcroForm flatten in `src/editor/adapters/pdf/sign.js` on 2026-09-11
(`hasFillableAcroForm` guard, `FormFlattenError`, four tests), with only its two-viewer check still
pending. What remains is narrower and different from what the old ticket described, and the question
"isn't Compress already a flatten?" deserved an answer on the record. Both are below.

## Compress is a flatten, and it is the wrong one for this query

PDkef already flattens in three places with three behaviours:

| Path | What it does | Keeps text? |
| --- | --- | --- |
| `src/editor/adapters/pdf/sign.js` (MOBI-02) | pdf-lib `form.flatten()`: bakes AcroForm widgets into page content | yes |
| `src/editor/adapters/pdf/redact.js` | rasterises marked pages at 2.5x, JPEG 0.95 | no |
| `src/lib/compress.js` | rasterises every page at 1.0-2.0x, JPEG 0.4-0.8 | no |

What a `flatten pdf` searcher means, read off the pages that rank for it (Adobe, Smallpdf, Xodo,
PDF4me, PDF4.dev): merge form fields, comments, stamps and signature appearances into the page so the
file looks the same in every viewer and can no longer be edited, **with the text still vector text**.
The classic trigger is exactly MOBI-02's defect: "I filled the form and the recipient sees empty boxes."
Layers and transparency are a distant second meaning.

Compress does flatten all four meanings at once, but by turning a typed form into a 110 DPI JPEG. That
is the "print it to an image" workaround the searcher is trying to avoid, it often makes the file
larger, and it is not even reliable as a flatten: Target Size mode returns a file untouched, fields
intact, when it is already under the limit. Its title, h1 and FAQ are about size limits, so a flatten
searcher who lands there bounces. **Decision: do not point `flatten pdf` at `/compress/`.** Cross-link
both ways instead (section "Page" below).

One more reason a page is needed: the site's own vocabulary is split. Redact's copy and
`/blur-vs-blackout-vs-delete-pdf/` use "flatten" to mean "the page becomes one image" (three FAQ
entries); Sign now uses it to mean "fields baked in, text kept". A page that names that difference is
the thing that teaches something.

## What pdf-lib's `flatten()` does not do (read from `node_modules/@cantoo/pdf-lib/cjs/api/form/PDFForm.js`)

These are fine for Sign's narrow input and not fine for a general tool fed arbitrary PDFs:

- **Widgets only.** `flatten()` walks `AcroForm.Fields` plus orphan `/Widget` annots. Comments, stamps,
  ink, highlights, free text, and non-form signature appearances are untouched. There is no pdf-lib API
  for those.
- **Per-widget failures are swallowed.** The loop at `flatten()` catches each widget's error with
  `console.error` and then calls `removeField` regardless, so a widget whose appearance could not be
  drawn silently disappears from the output. That is the exact "silent wrong answer" this tool exists
  to prevent. Sign's `FormFlattenError` only fires on errors outside that try block.
- **Placement is simplified.** `flattenWidgetOntoPage` translates to the widget `/Rect` origin and draws
  the appearance XObject as-is; it does not apply the appearance `/Matrix` or scale `/BBox` to `/Rect`
  (PDF 32000-1 section 12.5.5). Rotated or unusually produced forms can draw off.

So the shared flattener owns its own loop rather than calling `form.flatten()`: enumerate every page's
`/Annots`, and for each annotation with an `/AP` `/N` entry (resolving `/AS` for state dictionaries),
skipping `/Popup`, `/Link`, and any annot with the Hidden or NoView `/F` bit set, draw the appearance
XObject with the section 12.5.5 BBox-to-Rect transform, then remove the annot and, for widgets, the
field from `AcroForm.Fields`. Count what was drawn against what was found; any annotation that had an
appearance and was not drawn is a loud failure, never a skip. Roughly fifty lines of pdf-lib low-level
code; the appearance-stream handling mirrors `flattenWidgetOntoPage`, the transform is the new part.

The two MOBI-02 complications still apply and are already handled by its code, reuse them: detect a
form through `pdfDoc.catalog.getAcroForm()` (never `getForm()`, which strips XFA unless loaded with
`preserveXFA`), and stay inert on a document with nothing to flatten.

## Scope

**Part A, code, can ship now, independent of the SEO gate.** It hardens Sign's export regardless of
whether the page ever ships.

- One `flattenPdf(bytes, { mode })` in `src/editor/adapters/pdf/flatten.js`, with the loop above.
  `sign.js` calls it in place of its current `form.flatten()` step, same position (before the draw
  loop, for the content-stream ordering reason MOBI-02 records). No second copy anywhere.
- Mode `'keep-text'` (default): forms and annotations, text preserved. Mode `'image'`: every page
  rasterised through one shared helper pulled out of `redact.js` at its 2.5x / JPEG 0.95 settings, so
  Redact and Flatten cannot drift. Not Compress's settings; Compress keeps its own ladder because its
  job is size.
- MOBI-02's tests keep passing against the new implementation, plus: a fixture with a sticky-note
  comment and a stamp exports with an empty `/Annots` and the stamp still visible (pdf.js render, pixel
  check in the stamp rect); a fixture with a rotated page places the field appearance inside the
  field's `/Rect` after flattening; a fixture with one appearance-less widget rejects with
  `FormFlattenError` naming the count, not a partial file.

**Part B, the page, is downgraded to P3/longer-term on measured evidence.** The deep-research table's
"20k-50k" for `flatten pdf online` was a competitor-tool guess, never Keyword Planner or Trends. Shlomi
ran Google Trends worldwide, past 12 months, `flatten pdf` against the site's other core queries:
`merge pdf` averages ~90-100, `compress pdf` ~55-70, `edit pdf` ~35-75, `flatten pdf` sits at **1-2 for
the entire window** - not lower demand, noise-floor demand. Trends is relative interest and not a
volume figure, but a query that can't clear 2 against a 90-100 baseline for a full year is not "smaller
than compress/merge," it is a query almost nobody is typing. This reverses the old ticket's ranking of
`flatten pdf online` above `crop pdf online` and `extract images from pdf` in the same table; treat
every unmeasured row there (SEO-20, SEO-22 through SEO-24) as equally suspect until it gets the same
check, not just this one. Still get a Keyword Planner absolute-volume read (LOC-14 access) before fully
retiring the page idea, since Trends can miss a query with real but non-comparative volume, but plan
resourcing on the assumption it lands closer to zero than to 20k. SEO-06's Week 4 gate (no new URL while
the nine never-crawled pages have not moved) applies regardless and is a second reason not to build this
soon.

- `/flatten/`, registered in `src/data/tools.js`, non-slash redirect pair in `vercel.json`, How it works
  and FAQ with matching `<SeoSchema>`, no `noindex`, `npm run build && npm run preview` CSP pass.
- The page states exactly which kinds of flattening each mode performs: keep-text flattens form fields
  and annotations and does **not** touch layers or transparency; image mode flattens everything and
  loses selectable text. It states that either mode ends the document's life as a fillable form.
- It gives the reader a test they can run on the output: open it, try to click a field, try to select
  a word. That is the verifiable value the page has to carry; without it, it is a template swap.
- Cross-links, not redirects: `/compress/` gets one sentence ("compressing also flattens, as an image;
  to keep the text, use Flatten"), `/flatten/` points at Compress for size and at Redact for hiding
  content. The Redact FAQ's "Do I need to flatten the PDF separately?" entry gets a clause naming which
  kind of flatten it means.

## Acceptance

- Part A: `sign.js` no longer calls `form.flatten()`; one flattener, imported by Sign and (when built)
  the tool. MOBI-02's four tests and the three new fixtures above pass. A document with no form and no
  annotations exports byte-comparably to today. Nothing that had an appearance is dropped quietly.
- MOBI-02's own pending check is done through this code: the filled-form fixture opened in Chrome's
  viewer and macOS Preview, both named with what each showed.
- Part B: the Trends reading above is recorded (done, 2026-09-12); a Keyword Planner absolute-volume
  read and the SEO-06 gate outcome are recorded here before the page is built; the scope statement, the
  reader's test, and the cross-links above are on the page.
