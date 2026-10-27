---
id: "ARCH-70"
title: "pdf.js and pdf-lib results are typed once in lib, and tools stop using any"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-70 · pdf.js and pdf-lib results are typed once in lib, and tools stop using any

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Safety nets. Criterion: Type safety. Structure only: no behaviour change.

## Why

- About 40 explicit `any` sites sit in `src/tools`, concentrated in the Scan, Sign, Redact and Compress islands, mostly around pdf.js and pdf-lib results. `PdfjsLike` already exists in `pdfEncryption.ts:58`.

## Outcome

- Shared types for the pdf.js document, page and render results and for pdf-lib internals the code touches, in `src/lib`.

## Acceptance

- [x] `any` count in `src/tools` falls below 10, recorded by a ratchet.

## Closed 2026-10-27

src/lib/pdfTypes.ts names the pdf.js types; explicit `any` in non-test src/tools is 46 -> 3, held by test:any-ratchet, which counts every `any` type token (the wave review found the first counter missed generics, tuples and unions). Drift kept: renderBoxes.ts and src/lib/renderPage.js call page.render without `canvas`, which pdf.js 5's RenderParameters requires; the call is cast to PdfRenderParameters, unchanged.
