---
id: "ENC-05"
title: "Sign meets a protected PDF the same way Redact does"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
order: 5
depends_on: ["ENC-04"]
---

# ENC-05 · Sign meets a protected PDF the same way Redact does

*Plan section 4.* Sign shares `loadPdf` with Redact, so ENC-04 gives it the outcome. Here: its UI. Today an
owner-only file opens in Sign and its export adapters throw `EncryptedPDFError` (`sign.js:112`,
`flatten.js:251`, read and run), and a needs-password file shows the alert "Signing stopped. The PDF may
be password-protected" (`PdfWorkspace.tsx:778-787`).

## Brief
- Render `NeedsUnlock` for the `needs-unlock` outcome in place of the alert, and keep the alert for a
  damaged file. Handle the File Handling `launchQueue` entry (`PdfSignTool.tsx:614-628`) and Share Target
  hand-offs, which both reach `loadPdf`.
- Sign passes no `analyticsStatus`, so nothing else changes in lifecycle counting.

## Acceptance
- Island test with the ENC-01 fixtures: both kinds show the state, the editor never mounts, no recent is
  cached. Verified on a phone-width viewport, since Sign is phone-first.
