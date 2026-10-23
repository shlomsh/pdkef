---
id: "RED-68"
title: "Redact: a damaged form inside a page is skipped quietly, not reported"
status: "done"
priority: "P3"
epic: "redact"
depends_on: []
---

# RED-68 · Redact: a damaged form inside a page is skipped quietly, not reported

Filed 2026-10-23 from the daily error read.

## What happened

One report on 2026-10-23, `redact` / `Error` / step `walk_form_stream`, Chrome 155, build 9313e62,
while the person added a file. Resolved: pdf-lib's `FlateStream.js:116` throws "Invalid header in flate
stream" from `decodePDFRawStream(stream).decode()` in `walkForm`
(`src/editor/adapters/pdf/pdfObjects.js:1316`). The catch already skips the form, so nothing was lost
but the clickable objects inside it; the run did not fail.

## Why it is a ticket

A page content stream that will not decode is already the person's file
(`ContentStreamDecodeError`, skipped without a report in `deleteObjects.js`). A form's content stream
that will not decode is the same thing one level down, yet `walkForm` reports it.

## Outcome

- `walkForm` treats a form stream that will not decode like a page stream: skipped, no `reportError`,
  an `// expected:` comment. Any other error inside a form is still reported.
- `docs/error-known-items.json` knows `walk_form_stream` with the fix commit.

## Progress

Fixed in `dc907fae` (test first: `pdfObjectsForms.test.js`, a Form over junk FlateDecode bytes, seen
failing with `reportError` called once). Registry entry added beside it.
