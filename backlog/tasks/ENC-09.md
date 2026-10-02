---
id: "ENC-09"
title: "Edit Pages stops writing blank pages from a protected PDF and can take a file back"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "next"
order: 2
depends_on: ["ENC-01", "ENC-02"]
---

# ENC-09 · Edit Pages stops writing blank pages from a protected PDF and can take a file back

*Plan section 4, run.* `editPages` (`editPages.js:25`) loads with `ignoreEncryption: true` and writes blank pages for both kinds of protected file. `getPageCount()` works on a protected file (`PdfEditPagesTool.tsx:118`), and thumbnails come from pdf.js, which decrypts an owner-only file, so the editor looks normal right up to the empty download.

## Brief
- Probe in `handleFilesAdded` before the pdf-lib load and show `NeedsUnlock`.
- Refuse in `editPages` when `doc.isEncrypted`, so a future intake path cannot reach a blank save.
- Add a hand-off receiver (`useHandoffIntake` with the Edit Pages key from the ENC-02 map): the tool has none, so "Continue in Edit Pages" would have nowhere to land.

## Acceptance
- Unit: `editPages` cannot return a file for an encrypted input. Island tests: both kinds reach the state; a handed-off file opens.
