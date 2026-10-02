---
id: "ENC-07"
title: "Sign meets a protected PDF the same way Redact does"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
order: 3
depends_on: ["ENC-05"]
---

# ENC-07 · Sign meets a protected PDF the same way Redact does

*Plan section 4.* Sign shares `loadPdf` with Redact, so ENC-05 gives it the outcome. Here: its UI. Today an owner-only file opens in Sign and its export adapters throw `EncryptedPDFError` (`sign.js:112`, `flatten.js:251`), and a needs-password file shows "Signing stopped. The PDF may be password-protected" (`PdfWorkspace.tsx:778-787`).

## Brief
- Render `NeedsUnlock` for the `needs-unlock` outcome in place of the alert; keep the alert for a damaged file. Cover the File Handling `launchQueue` entry (`PdfSignTool.tsx:614-628`) and Share Target hand-offs, which both reach `loadPdf`.

## Acceptance
- Island test with the ENC-01 fixtures: both kinds show the state, the editor never mounts, no recent is cached. Verified at phone width, since Sign is phone-first.
