---
id: "MERGE-23"
title: "Merge reads a PDF with an empty /CreationDate, and every unreadable-file failure is reported"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# MERGE-23 · Merge reads a PDF with an empty /CreationDate, and every unreadable-file failure is reported

*Found 2026-10-15 in production by hand.* A health-fund form carrying `/CreationDate ()` was shown as
"could not be read. It may be damaged." in Merge. pdf-lib's `getCreationDate` throws on an empty date
string and `inspectPdf` let it escape; the date is only a sort hint.

Reporting had the gap behind it: a `MergeFileError` was never reported, and pdf.js's damaged-file names
(`InvalidPDFException`, `MissingPDFException`, `FormatError`) were ignored, so a valid file a parser cannot
read looked the same as a broken one in Merge, Sign, Redact, Split and Edit Pages.

## Acceptance

- [x] `inspectPdf` resolves with no date for an empty or malformed `/CreationDate`; test seen failing first.
- [x] The damaged-file names travel as reports; Merge reports the cause a `MergeFileError` wraps, never a password-protected file.
- [x] `docs/error-known-items.json` entry `MERGE-DATE` for the production fingerprint.
