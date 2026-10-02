---
id: "ENC-08"
title: "Split stops writing blank pages from a protected PDF, and shows when a file did not load"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "now"
order: 3
depends_on: ["ENC-01", "ENC-02"]
---

# ENC-08 · Split stops writing blank pages from a protected PDF, and shows when a file did not load

*Found 2026-10-02 while planning the protected-PDF work; run against real fixtures, plan section 4. Lands with ENC-01, ENC-02 and ENC-05.* On an owner-only file, `splitPdf` (`split.js:56`) loads with `ignoreEncryption: true`, copies the page streams without decrypting them and saves a valid, unencrypted PDF whose pages are blank (reloaded in pdf.js: no text, 0 dark pixels). The person gets a successful download. This is the silent one, which is why it leads.

## Brief
- Classify in `loadDocumentAndThumbnails` (`PdfSplitTool.tsx:229-236`), which already runs pdf.js on every file, and show `NeedsUnlock` for both kinds. Split already has a receiver (`useHandoffIntake`).
- Fix the status overwrite found in the same read: after a pdf.js load failure the prepare effect (`:164-169`) sets 'ready' on an empty page list, so a failure shows an empty grid and no message (read, high confidence, not run). A damaged file gets its alert back.
- Defense in depth: `splitPdf` throws when `doc.isEncrypted`, as `mergePdfs` already does (`merge.js:214`).

## Acceptance
- Unit: `splitPdf` cannot return a file for an encrypted input. Island tests: both kinds reach the state; a damaged file reaches the alert.
