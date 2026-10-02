---
id: "ENC-07"
title: "Sign shows the protected state instead of its alert"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "later"
order: 1
depends_on: ["ENC-02"]
---

# ENC-07 · Sign shows the protected state instead of its alert

*Plan section 4.* Sign shares `loadPdf` with Redact, so ENC-02 already gives it the outcome through the optional callback; here, its UI. Today an owner-only file opens in Sign and its export adapters throw `EncryptedPDFError` (`sign.js:112`, `flatten.js:251`), and a needs-password file shows "Signing stopped. The PDF may be password-protected" (`PdfWorkspace.tsx:778-787`).

## Brief
- Render the shared state (promoted in ENC-06) for the `needs-unlock` outcome in place of the alert; keep the alert for a damaged file. Cover `launchQueue` (`PdfSignTool.tsx:614-628`) and Share Target hand-offs, which both reach `loadPdf`.

## Acceptance
- Island test with the ENC-01 fixtures: both kinds show the state, the editor never mounts, no recent is cached. Verified at phone width.
