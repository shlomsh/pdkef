---
id: "RED-64"
title: "Redact details reader waits for the document to open, so a protected PDF never reaches pdf-lib"
status: "open"
priority: "P2"
epic: "redact"
horizon: "now"
depends_on: []
---

# RED-64 · Redact details reader waits for the document to open, so a protected PDF never reaches pdf-lib

Filed 2026-10-11 from the daily error read. A regression of [ENC-02](ENC-02.md)'s gate, not a new defect class.

## What happened

One report on 2026-10-09, `redact` / step `details_read`, chromium-154, build 08e10cf (contains the ENC-02 fix bb156a5b), actions `add_files` only. Resolved: `PDFDocument.load` throws `EncryptedPDFError` (`PDFDocument.js:174`). The report is the ENC-02 design working as written: "an `EncryptedPDFError` report means the gate missed something".

## Cause

RED-59 added `useDocumentDetails(file)` (`src/tools/redact/details/useDocumentDetails.ts`, called at `PdfRedactTool.tsx:793`). It starts `readDetails(file)` as soon as `file` is set, which is before pdf.js has answered, so a protected file reaches pdf-lib. ENC-02 gated `useDeletableObjects` and `useDeletePreviews` on the document having opened; this reader came after and was not gated.

## Decision

The ticket as first asked ("don't report encrypted PDFs") would hide the miss; ENC-02 deliberately keeps these reports. Fix the gate instead: pass the reader the same "document opened" signal the other two readers use. If a protected file still reaches it, that stays reported.

## Brief
- Gate `useDocumentDetails` on the document having opened, the way `useDeletableObjects` is.
- List every other pdf-lib reader mounted at `PdfRedactTool.tsx` and confirm each is gated; add a test that mounts Redact with an owner-only fixture and asserts no pdf-lib load on the protected bytes (extend the ENC-02 island test).
- Add the ENC-02-style regression note to `docs/error-known-items.json` only if the entry's match needs the new chunk; the existing entry already matches `details_read`.

## Acceptance
- Island test with an owner-only fixture: no `details_read` report, no pdf-lib load of the protected bytes; seen failing first.
- A day of production reads after the fix with no `details_read` `EncryptedPDFError`.
