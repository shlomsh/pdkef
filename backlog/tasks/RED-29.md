---
id: "RED-29"
title: "Delete finds what a page draws inside a Form XObject"
status: "open"
priority: "P1"
epic: "redact"
horizon: "next"
order: 1
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
