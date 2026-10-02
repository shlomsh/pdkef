---
id: "ENC-06"
title: "Split and Edit Pages stop writing blank pages from a protected PDF"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "now"
order: 3
depends_on: ["ENC-01", "ENC-02"]
---

# ENC-06 · Split and Edit Pages stop writing blank pages from a protected PDF

*Found 2026-10-02 while planning the protected-PDF work; run against real fixtures, plan section 4.*
On an owner-only file, `splitPdf` (`split.js:56`) and `editPages` (`editPages.js:25`) load with
`ignoreEncryption: true`, copy the page streams without decrypting them, and save a valid, unencrypted
PDF whose pages are blank (output reloaded in pdf.js: 2 pages, no text, 0 dark pixels). The person gets a
successful download. Edit Pages' thumbnails come from pdf.js, which decrypts fine, so the editor looks
normal right up to the empty file. This is the silent one, which is why it leads.

## Brief
- Split: classify in `loadDocumentAndThumbnails` (`PdfSplitTool.tsx:229-236`), which already runs pdf.js
  on every file, and show `NeedsUnlock` for both kinds. Fix the status overwrite found in the same read:
  after a pdf.js load failure the prepare effect (`:164-169`) sets 'ready' on an empty page list, so a
  failure shows an empty grid and no message (read, not run). A damaged file gets its alert back.
- Edit Pages: `handleFilesAdded` loads with pdf-lib at `PdfEditPagesTool.tsx:118`, where `getPageCount()`
  succeeds on a protected file; probe first (`probeEncryption`) and show the state.
- Defense in depth: `splitPdf` and `editPages` refuse (throw) when `doc.isEncrypted`, as `mergePdfs` already
  does (`merge.js:214`), so a future intake path cannot reach a blank save.

## Acceptance
- Unit: neither function can return a file for an encrypted input. Island tests: both kinds reach the
  state in each tool; a damaged file reaches the alert in Split.
- The cross-tool table test (ENC-10) includes both tools.
