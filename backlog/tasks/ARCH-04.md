---
id: "ARCH-04"
title: "Split PDF-library adapters out of workspace/ and lib/"
status: "open"
priority: "P2"
epic: "editor-architecture"
phase: "unspecified"
depends_on: []
legacy_state: "Open"
---

# ARCH-04 · Split PDF-library adapters out of workspace/ and lib/

## Scope and acceptance

**Split PDF-library adapters out of `workspace/` and `lib/`.** `src/editor/workspace/loadPdf.ts:1` imports `getPdfjs` from `src/lib/sign.js`, pulling the whole export path into what should be pure session/loading coordination. Create `src/editor/adapters/pdf/` and move the actual pdf.js/pdf-lib/fontkit integration there: the pdfjs loader (out of both `loadPdf.ts` and `sign.js`), plus the Sign/Redact-specific serialization in `sign.js`, `redact.js`, `pdfObjects.js`, `contentStream.js`, `deleteObjects.js`, `applyPageEdits.js`. `workspace/loadPdf.ts` then calls into `adapters/pdf` instead of reaching into `lib/sign.js` directly. Scoped to the Sign/Redact editor's own PDF plumbing — Merge/Compress/Split/Edit Pages/Image-to-PDF's `lib/*.js` are standalone tools outside the editor core, out of scope here. Land one module at a time; don't block on all six files in one change.
