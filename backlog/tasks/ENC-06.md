---
id: "ENC-06"
title: "Split and Edit Pages stop writing blank pages from a protected PDF"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "next"
order: 1
depends_on: ["ENC-01"]
---

# ENC-06 · Split and Edit Pages stop writing blank pages from a protected PDF

*Found 2026-10-02 while planning the protected-PDF work; run against real fixtures, plan section 4. Not part of the Redact slice, and recommended next.* On an owner-only file, `splitPdf` (`split.js:56`) and `editPages` (`editPages.js:25`) load with `ignoreEncryption: true`, copy the page streams without decrypting them and save a valid, unencrypted PDF whose pages are blank (reloaded in pdf.js: no text, 0 dark pixels). The person gets a successful download. Edit Pages' thumbnails come from pdf.js, which decrypts fine, so its editor looks normal right up to the empty file.

## Brief
- Classify at intake (Split: `loadDocumentAndThumbnails`, `PdfSplitTool.tsx:229-236`; Edit Pages: `handleFilesAdded` before the pdf-lib load at `PdfEditPagesTool.tsx:118`) and show a quiet state with "Unlock it" (promote the Redact state to `src/shell` here, now that it has a second consumer). Edit Pages has no hand-off receiver, so add one.
- Refuse to write: `splitPdf` and `editPages` throw when `doc.isEncrypted`, as `mergePdfs` already does (`merge.js:214`).
- Split's status overwrite found in the same read: after a pdf.js load failure the prepare effect (`:164-169`) sets 'ready' on an empty page list, so a failure shows an empty grid and no message (read, high confidence, not run).

## Acceptance
- Unit: neither function can return a file for an encrypted input. Island tests per tool: both kinds reach the state; a damaged file reaches an alert in Split.
