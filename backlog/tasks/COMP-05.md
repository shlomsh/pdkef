---
id: "COMP-05"
title: "Compress: a file with no PDF header is skipped at intake"
status: "done"
priority: "P2"
epic: "polish"
depends_on: []
---

# COMP-05 · Compress: a file with no PDF header is skipped at intake

Filed 2026-11-05 from the daily error read.

## What happened

One person on 2026-11-04, Chrome 142, build e9e39b4: two reports from one page load. pdf.js threw
`InvalidPDFException` at `render_compare_preview`, and pdf-lib threw `MissingPDFHeaderError` (minified
to `qo`) at `compress`, which counted a failed run and showed "PDF compression failed."
`useFileIntake.ts` already had the answer: `probeEncryption` returned `unreadable`, but only
`needs-password` stops there, so the file went on to a run that could only fail.

## Outcome

- A file pdf.js cannot open and that holds no `%PDF-` anywhere is skipped at intake with the existing
  "Skipped ... - not a PDF, JPG or PNG." line. The tool goes back to its empty state, ready for another
  file. No run, no failed count, no error report.
- A file that has a header and that pdf.js rejects goes on as before and still reports: a valid file the
  library cannot read looks the same as a broken one (tools-and-shell rule, "Catching errors").
- `docs/error-known-items.json` knows both fingerprints.

## Shipped

`checkEncryption` skips the file when `probeEncryption` says `unreadable` and `hasPdfHeader` finds no
`%PDF-`. Tests in `PdfCompressTool.protected.test.tsx` cover the skip, the next file loading, and a
headered file carrying on.
