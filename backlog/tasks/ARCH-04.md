---
id: "ARCH-04"
title: "Split PDF-library adapters out of workspace/ and lib/"
status: "done"
priority: "P2"
epic: "editor-architecture"
phase: "unspecified"
depends_on: []
legacy_state: "Done 2026-09-02"
---

# ARCH-04 · Split PDF-library adapters out of workspace/ and lib/

## Scope and acceptance

**Split PDF-library adapters out of `workspace/` and `lib/`.** `src/editor/workspace/loadPdf.ts:1` imports `getPdfjs` from `src/lib/sign.js`, pulling the whole export path into what should be pure session/loading coordination. Create `src/editor/adapters/pdf/` and move the actual pdf.js/pdf-lib/fontkit integration there: the pdfjs loader (out of both `loadPdf.ts` and `sign.js`), plus the Sign/Redact-specific serialization in `sign.js`, `redact.js`, `pdfObjects.js`, `contentStream.js`, `deleteObjects.js`, `applyPageEdits.js`. `workspace/loadPdf.ts` then calls into `adapters/pdf` instead of reaching into `lib/sign.js` directly. Scoped to the Sign/Redact editor's own PDF plumbing — Merge/Compress/Split/Edit Pages/Image-to-PDF's `lib/*.js` are standalone tools outside the editor core, out of scope here. Land one module at a time; don't block on all six files in one change.

**Completed 2026-09-02.** `src/editor/adapters/pdf/` now holds `pdfjsLoader.js`, `sign.js`, `redact.js`, `pdfObjects.js`, `contentStream.js`, `deleteObjects.js` and `applyPageEdits.js`, plus each file's test, landed in the 3 slices docs/editor-module-boundaries-plan.md called for: (1) the pdfjs loader, unblocking `workspace/loadPdf.ts`'s direct dependency on `sign.js`; (2) `sign.js`/`redact.js`'s serialization logic, with `sign.js`'s incidental re-exports (`detectTextDirection`/`getEffectiveTextDirection`/`hexToRgbFractions`/`tintImageDataUrl` from `signHelpers.js`, `HANDWRITING_FONTS`/`TEXT_FONTS`/`resolveFontFamily` from `editor/text/fonts.js`) dropped in favor of every consumer importing directly from the module that actually owns each export; (3) the smaller supporting files, self-contained relative to each other. `src/lib/` no longer contains any of these 11 files. No behavior change; every import site (components, hooks, the font-coverage generator/table, and doc comments in `editorModel.ts`) was repointed to match.
