---
id: "RED-48"
title: "A Delete-only save carries no copy of what was deleted"
status: "in_progress"
priority: "P1"
epic: "redact"
horizon: "now"
order: 1
depends_on: []
---

# RED-48 · A Delete-only save carries no copy of what was deleted

*Found 2026-10-01 while building RED-29.* `rewritePageContent` gives a page a new content stream but leaves
the old one in the document, unreferenced, and pdf-lib writes every object on save. When the export has
deletions and no box (`applyPageEdits.js` returns the Delete result directly), the saved file still holds the
deleted text in that old stream. No viewer shows it, but the bytes are there. Exports with a box are not
affected: the cover export assembles a fresh document from what pages reach.

- Every stream a rewrite replaced (a page's old `/Contents`, single or array, and RED-29's replaced Forms)
  leaves the document once nothing references it.
- A test reads every object of the saved file, decoded, and finds no deleted run, for page-level and
  form-level deletions.

## Acceptance
- The probe that found it (page-level delete of one `drawText` run, then a scan of every decoded stream) finds nothing.

## Result
`removeOrphanedForms` became `removeOrphans(doc, candidates)` in `deleteObjects.js`; `rewritePageContent` now adds
every ref of the page's old `/Contents` (a ref, a ref to an array, or a direct array) to the candidates beside the
replaced Forms. Candidates are deleted only at zero references, so a stream shared by two pages stays. Other
replaced objects: link removal and `clearDocumentDetails` already delete what they drop, so nothing else was added.
`deleteLeavesNoCopy.test.js` scans every decoded stream of the saved bytes (single stream, array, ref-to-array,
shared stream kept, per-page and nested forms); three of its tests fail without the fix.
