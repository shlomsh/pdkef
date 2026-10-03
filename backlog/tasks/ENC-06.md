---
id: "ENC-06"
title: "Split and Edit Pages stop writing blank pages from a protected PDF"
status: "done"
priority: "P1"
epic: "robustness"
depends_on: ["ENC-01"]
---

# ENC-06 · Split and Edit Pages stop writing blank pages from a protected PDF

*Found 2026-10-02 while planning the protected-PDF work; run against real fixtures, plan section 4. Not part of the Redact slice, and recommended next.* On an owner-only file, `splitPdf` (`split.js:56`) and `editPages` (`editPages.js:25`) load with `ignoreEncryption: true`, copy the page streams without decrypting them and save a valid, unencrypted PDF whose pages are blank (reloaded in pdf.js: no text, 0 dark pixels). The person gets a successful download. Edit Pages' thumbnails come from pdf.js, which decrypts fine, so its editor looks normal right up to the empty file.

## Decision (2026-10-03, Shlomi)
An edge case, so the simplest fix: no NeedsUnlock state, no Unlock detour, no new receivers. `splitPdf` and `editPages` throw when `doc.isEncrypted`, so the existing error path ("Could not prepare the split PDF." / "Failed to edit PDF.") replaces a successful download of a blank file. The earlier plan (intake classification, `RETURN_TO` entries, an Edit Pages receiver) is dropped on purpose. Split's status overwrite after a pdf.js load failure (read, not run) is not part of this either.

## Acceptance
- `split.test.js` (both modes) and `editPages.test.js`: an owner-only fixture rejects with "password protected"; each seen red first, then green.
