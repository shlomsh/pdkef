---
id: "ARCH-108"
title: "Sign keeps its document-load fields in signState"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-108 · Sign keeps its document-load fields in signState

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding P1.
Area: Code. Criterion: Thin components over pure logic. Structure only: no behaviour change.

## Why

- The Sign lifecycle is a typed reducer, but `src/tools/sign/PdfSignTool.tsx:125` still holds 16 `useState` calls (file, bytes, pdf.js document, page sizes, dialogs, armed signature).

## Outcome

- The document-load fields folded into `signState` actions.

## Acceptance

- [x] The island holds fewer `useState` calls, with the file, bytes, document and page sizes in the reducer.
- [x] The reducer tests cover the new actions.

## Closed 2026-10-27

`file`, `sourceBytes`, `pdfDocument`, `numPages` and `pageSizes` moved into `signState` as `DOCUMENT_FILE_SET`, `PDF_DOCUMENT_READY` and `PAGE_SIZES_MEASURED`, each dispatched where the old setter ran. `useState` calls 17 -> 12. Reducer tests were written first and seen failing.
