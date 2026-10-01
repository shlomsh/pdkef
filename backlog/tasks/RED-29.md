---
id: "RED-29"
title: "Delete finds what a page draws inside a Form XObject"
status: "done"
priority: "P1"
epic: "redact"
depends_on: []
---

# RED-29 · Delete finds what a page draws inside a Form XObject

*Found 2026-09-28 on a real iTextSharp 5.5.10 insurance policy (10 pages, Hebrew text, not scanned).*
Shlomi: "for some reason i can not delete anything here on redact."

Every page's own content stream is only `q ... /Xf1 Do Q`; all of its 95-128 text runs and its background
image are drawn inside that Form XObject. `extractPageObjects` (`src/editor/adapters/pdf/pdfObjects.js`)
tokenizes only the page's own `/Contents` and records a `Do` only when it paints an image, so it returns
0 objects on all 10 pages and the Delete tool has nothing to offer.

## Scope

- Recurse into `/Form` XObjects on `Do`, with the Form's own `/Resources` (falling back to the page's),
  its `/Matrix`, and the accumulated `cm`/`q`/`Q` transform; report the objects found inside with their
  owner stream.
- Deletion rewrites the Form's stream, not the page's (`deleteObjects.js` `rewritePageContent` /
  `spliceOut` assume every span is in the page stream). A Form shared by several pages is copied before
  it is edited, so a delete on one page never changes another.
- The on-screen preview (`buildDeletePreviewPage`) and the saved-file check follow the same path.
- A fixture shaped like this file (one Form XObject per page holding all text and an image) in the unit
  tests, plus an export test that the deleted run is gone and the other pages are untouched.

## Result

`extractPageObjects` walks Form XObjects (form `/Resources` falling back to the parent's, `/Matrix`, depth 8, cycle guard, first `Do` only) and every object carries `formPath`. Deletion never edits a Form in place: it copies each Form on the path for that page, repoints the parent, splices the copy, and drops originals nothing references any more. The delete box carries `formPath` through drafts, the export and the preview. Tested on a fixture shaped like the insurance policy (per-page, shared and nested Forms), end to end through `applyPageEdits`, with and without a cover box. (998b8f1c, e7618ad2, a4f7c59c)
