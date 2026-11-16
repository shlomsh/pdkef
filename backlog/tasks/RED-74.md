---
id: "RED-74"
title: "Redact: the error read knows a tab that outlived a deploy at the object list and document details"
status: "done"
priority: "P3"
epic: "redact"
depends_on: []
---

# RED-74 · Redact: the error read knows a tab that outlived a deploy at the object list and document details

Filed 2026-11-16 from the daily error read.

## What happened

Two reports on 2026-11-13, `redact` / `TypeError` at steps `list_objects` and `details_read`, Chromium
157, build 6cd493f, and two drop records with cause `module_load` at the same two steps on
2026-11-16, Chromium 158, build d6a9b77 (8 Nov). `errors:resolve --build 6cd493f` maps both frames to
lazy imports: `src/tools/redact/hooks/useDeletableObjects.js:35` (`import('../lib/deleteObjects.js')`)
and `src/tools/redact/lib/details/readDetails.ts:10` (`import('#lib/pdf/openPdfDoc.ts')`). The tab
outlived a deploy, the same cause as RED-67 (export) and RED-69 (saved-file check). Every run that day
finished; Redact's `failed` stayed 0.

## Outcome

- `docs/error-known-items.json` has an `open` entry `RED-74` (area `redact`, `TypeError`, steps
  `list_objects` and `details_read`, chunk `redact-tool`), so the daily read lists these as known
  rather than new. A pdf-lib error at those steps still reads as ENC-02.
- `scripts/errors-known.test.mjs` pins both real fingerprints to `RED-74`, seen failing first.
