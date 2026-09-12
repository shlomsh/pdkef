---
id: "MERGE-02"
title: "Merge rejects PDFs with an empty MIME type that Compress accepts"
status: "open"
priority: "P1"
epic: "merge-tool"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
---

# MERGE-02 · Merge rejects PDFs with an empty MIME type that Compress accepts

*Filed 2026-09-13* from the Merge review.

## Scope and acceptance

`addFiles` in `src/components/PdfMergeTool.tsx` keeps a file only when `f.type === 'application/pdf'`
and reports everything else as `Skipped "{name}" - not a PDF.` Some drag sources and some file
pickers hand over a `File` with an empty `type`; `FilePreview.tsx` records exactly this lesson, and
Compress already dispatches through `deriveFileKind` in `src/lib/fileKind.js`, which falls back to the
extension. A `.pdf` dropped from one of those sources is silently refused by the tool with the most
traffic and accepted by the tool next to it.

**Acceptance.**

- Merge classifies through `deriveFileKind`; a `File` named `x.pdf` with `type: ''` is added.
- The "skipped" hint still fires for a real non-PDF (an image, a `.docx`).
- Unit test in `PdfMergeTool.test.tsx` for both cases. A follow-up grep confirms no other tool still
  compares `file.type` directly; if one does, it is listed here and fixed in the same change.
