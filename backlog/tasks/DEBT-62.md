---
id: "DEBT-62"
title: "Every tool accepts a PDF the browser reports with no file type"
status: "open"
priority: "P1"
epic: "unify-and-narrow"
horizon: "now"
order: 1
depends_on: []
---

# DEBT-62 · Every tool accepts a PDF the browser reports with no file type

*Filed 2026-10-26* from the architecture review ([docs/architecture-debt-review-2026-10-26.md](../../docs/architecture-debt-review-2026-10-26.md), "Two findings that may be bugs"). Suspected,
not yet seen in production.

## Why

Six tools filter intake on `f.type === 'application/pdf'`: Split (`PdfSplitTool.tsx:117`), Edit Pages
(`PdfEditPagesTool.tsx:94`), PDF to Image (`PdfToImageTool.tsx:99`), Unlock/Protect
(`PdfSecurityTool.tsx:137`), Sign (`PdfSignTool.tsx:540`) and Redact (`PdfRedactTool.tsx:503`).
Compress, Merge and the home page use `deriveFileKind` (`src/lib/fileKind.js`), which also accepts
a `.pdf` with an empty type, as some platforms and file providers hand over. The same file would open
in two tools and silently do nothing in six.

## Outcome

- Start from a test that fails today: a `File` named `x.pdf` with `type: ''` dropped on one of the six
  tools is accepted. See it red before changing code.
- All six tools decide "is this a PDF" through `deriveFileKind`, so no tool owns its own rule.
- The rejected-files hint stays as it is for files that really are not PDFs.

## Acceptance

- [ ] A unit test per decision point (or one shared test over the shared helper plus a guard that no
      tool compares `f.type` to `'application/pdf'`) was red before the fix and is green after.
- [ ] `grep -rn "type === 'application/pdf'" src/tools` finds no intake filter.
