---
id: "ENC-04"
title: "Unlock's done state offers Redact it and Sign it"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "now"
order: 3
depends_on: ["ENC-03"]
---

# ENC-04 · Unlock's done state offers Redact it and Sign it

*Plan section 3; guidelines section 13 already lists Unlock to Sign as a candidate.* Unlock's done state is Download and Share only (`PdfSecurityTool.tsx:197-210`).

## Brief
- Two quiet buttons after Download and Share, "Redact it" and "Sign it", each with the target tool's icon, copied from Redact's row (`RedactFinish.tsx:55-76`: a handoff row, a `useNavigatingAway` busy flag, a failure line). Each calls `saveHandoff('<tool>', {fileName: '<name>_unlocked.pdf', fileType: 'application/pdf', fileBytes})` then navigates to `/redact/` or `/sign/`; their `beforeRestore` receivers already take it. Always shown after an unlock, not only when the person came from Redact. Never in front of Download.
- Unlock must keep the output bytes (not only the object URL) to hand over.
- Tools may not import each other (module-boundaries rule 1), so the row is written in the Unlock folder; ENC-12 folds the copies into one.

## Acceptance
- Unit: each button saves the hand-off with the unlocked bytes under `<name>_unlocked.pdf` and navigates; a failed save shows the line and re-enables the button; the busy flag clears on a persisted `pageshow`. Reviewed at 1280 and 375.
