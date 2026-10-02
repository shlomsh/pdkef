---
id: "ENC-13"
title: "PDF to Image meets a protected PDF at the door and leads back after Unlock"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "later"
order: 4
depends_on: ["ENC-08"]
---

# ENC-13 · PDF to Image meets a protected PDF at the door and leads back after Unlock

*Split from ENC-08 on 2026-10-02 before work started; plan section 4.* PDF to Image parses the file only on the main button (`toImage.js:95`), so a needs-password file is accepted and rejected later with generic copy. An owner-only file converts correctly (pdf.js only, run), so only `needs-password` is gated.

## Brief
- The same shape as Compress in ENC-08: probe at intake with `probeEncryption` (stale-result guard), show `src/shell/NeedsUnlock.tsx` with `from: 'pdf-to-image'`, the tool's name and verb, and its strings in `toolMessages.ts`.
- PDF to Image has no hand-off receiver: add `useHandoffIntake('pdf-to-image', ...)`, and add its key to `RETURN_TO` in `PdfSecurityTool.tsx` so Unlock leads back with "Continue in PDF to Image".

## Acceptance
- Island test: needs-password shows the state before the button exists; owner-only and plain proceed; Unlock it parks the file with `from: 'pdf-to-image'`.
- A round-trip spec in `e2e/handoff/` from PDF to Image through Unlock and back.
