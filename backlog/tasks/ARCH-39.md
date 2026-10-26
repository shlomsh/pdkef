---
id: "ARCH-39"
title: "One set of PDF primitives in lib"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 8
depends_on: []
---

# ARCH-39 · One set of PDF primitives in lib

*Filed 2026-10-26* from the architecture review ([docs/architecture-debt-review-2026-10-26.md](../../docs/architecture-debt-review-2026-10-26.md), section 5).

## Why

`getPdfjs()` is memoized four times (`compress.js:10`, `toImage.js:11`, `lib/thumbnails.js:13`,
`editor/adapters/pdf/pdfjsLoader.js:5`) and only thumbnails shares a worker. The page-to-canvas
render is written five times. pdf-lib documents open through five recipes, with the empty-password
retry duplicated and the page-tree repair applied to Split and Edit Pages only. Bytes conversion is
written five ways (two use a cross-realm unsafe `instanceof ArrayBuffer`), and 13 hand-written
`AbortError` throws carry five messages.

## Outcome

- One pdf.js loader with one shared worker, one `renderPageToCanvas` (white fill, the canvas cap from
  DEBT-63), one `openPdfDoc(bytes, { encryption, repair })`, one `toBytes()` and native
  `signal.throwIfAborted()` (or one small helper), each with every caller moved onto it.
- `lib/thumbnails.js` keeps only thumbnails; the other jobs it carries move to the modules above.
- Source-grep guards (in the style of `pdfjsWasm.test.js`) stop a second pdf.js loader or a
  hand-written `AbortError`.

## Acceptance

- [ ] The guards were red on the old code and are green.
- [ ] Every tool's unit tests and the export e2e guards pass; Compress and PDF to Image output is
      byte-identical for the existing fixtures.
- [ ] Merge and Split's export decide on the page-tree repair deliberately, recorded in this ticket.
