---
id: "FORM-35"
title: "Count how often Sign opens a page that is only an image, before building anything for scans"
status: "done"
priority: "P2"
epic: "form-detection"
depends_on: []
---

# FORM-35 · Count how often Sign opens a page that is only an image, before building anything for scans

## Why

FORM-32 and FORM-33 showed that serving scans means a raster geometry pass (FORM-07) first and OCR
or a learned detector only after it, all of it real work. Nobody knows whether scans are common in
Sign: MOBI-14's question ("how often is a PDF with no text layer and no vector ink opened, split by
Hebrew") was never instrumented. `sign_form_detection` (`src/lib/maintenanceEventSchema.ts`) reports
an outcome and a field-count bucket only.

## Scope and acceptance

- [x] Add one coarse property to `sign_form_detection` from a closed list (for example the first
  page is text, vector-only, or image-only), decided by the detector's existing inputs, never from
  page content beyond that. Same rules as the rest of the schema: no counts, no durations, nothing
  that characterises a document. The site locale (`en`/`he`) only if the schema's review allows it.
- [x] Schema, sender and `api/report.ts` parse updated together with their tests; `errors:read`
  shows the split.
- [x] After 4 weeks of data, record the share and decide: moved to FORM-39, since it waits on data, not work.

## Outcome

`sign_form_detection` success events carry an optional `page_kind` off a closed list: `text` (pdf.js found
text on page 1), `vector` (no text, axis-aligned line or box ink), `image` (neither, but an image is drawn) or
`none`. `firstPageKind` (`src/tools/sign/fields/pageKind.js`) decides it from the text runs and page content detection already loads; the
ink and image probes run only when the cheaper ones found nothing, a throwing probe counts as "not there", and
it rides the detector's lazy chunk. The parse accepts the old shape too, so cached clients still count, and the
field reads `sign_form_detection|success|none|image|<engine>`, which `errors:read` shows in its detail column.
The site locale is not sent: the schema carries nothing about the reader, and the page kind answers the question
on its own. Ink inside Form XObjects, curves and diagonals is not seen, so such a page reads as `image` or `none`.
