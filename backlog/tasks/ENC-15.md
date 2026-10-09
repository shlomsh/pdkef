---
id: "ENC-15"
title: "Encrypted-PDF errors from pdf-lib travel as error reports under a minified name"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# ENC-15 · Encrypted-PDF errors from pdf-lib travel as error reports under a minified name

Found in production on 9 Oct. pdf-lib throws `EncryptedPDFError` from `PDFDocument.load` on an
encrypted file. In the production bundle the class name is minified (the report arrived with name
`fm`), so `IGNORED_ERROR_NAMES` in `src/lib/errorReport.ts` cannot catch it, and
`src/tools/redact/details/useDocumentDetails.ts` sent it as a report at step `details_read`. An
encrypted PDF is the person's file, not our defect, and must never be reported.

## Acceptance

No error report is built for pdf-lib's encrypted-file error, whatever its class name; the registry's
ENC-02 entry also matches `details_read`.

## Outcome

`toErrorReport` drops the error by name or by its message (unit test in `src/lib/errorReport.test.ts`);
ENC-02 matches `details_read`. Shipped with CRITICAL_VERSION 5 so open tabs take the fix now.
