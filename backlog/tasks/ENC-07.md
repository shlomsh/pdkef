---
id: "ENC-07"
title: "Sign shows the protected state instead of its alert"
status: "done"
priority: "P2"
epic: "robustness"
order: 2
depends_on: ["ENC-02"]
---

# ENC-07 · Sign shows the protected state instead of its alert

*Plan section 4.* Sign shares `loadPdf` with Redact, so ENC-02 already gives it the outcome through the optional callback; here, its UI. Today an owner-only file opens in Sign and its export adapters throw `EncryptedPDFError` (`sign.js:112`, `flatten.js:251`), and a needs-password file shows "Signing stopped. The PDF may be password-protected" (`PdfWorkspace.tsx:778-787`).

## Brief
- Render the shared state (promoted in ENC-06) for the `needs-unlock` outcome in place of the alert; keep the alert for a damaged file. Cover `launchQueue` (`PdfSignTool.tsx:614-628`) and Share Target hand-offs, which both reach `loadPdf`.

- The detour contract (2026-10-02, Shlomi's QA): the tool that meets a protected file parks it for Unlock with `from: '<its key>'`; Unlock's done state then leads with "Continue in <tool>" and a quiet download, and hands the unlocked file back (`RETURN_TO` in `PdfSecurityTool.tsx`, guideline 13). Unlock already leads back to Sign; this ticket adds the sending side (`from: 'sign'`), and Sign's existing hand-off receiver takes the file back.

## Acceptance
- The round trip in `e2e/handoff/encrypted-roundtrip.spec.js` gains a Sign case: protected file in Sign, Unlock it, Continue in Sign, Sign's editor has `<name>_unlocked.pdf`.
- Island test with the ENC-01 fixtures: both kinds show the state, the editor never mounts, no recent is cached. Verified at phone width.

## Result

Shipped on `fix/unlock-done-state` (ae7190b4). Sign passes `onNeedsUnlock` to the shared `loadPdf`, so both kinds show `NeedsUnlock` (`src/shell/`) with Sign's own English and Hebrew copy and `from: 'sign'`; the editor never mounts and the file never reaches recents. Every entry point (pick, draft restore, `launchQueue`, hand-off intake) goes through `loadPdf`. The export catch keeps `reportError` (a gate miss) and shows the state instead of an alert. Island tests: `PdfSignTool.protected.test.tsx`; round trip: `e2e/handoff/encrypted-roundtrip-sign.spec.js`. Checked at 1280 and 375.
