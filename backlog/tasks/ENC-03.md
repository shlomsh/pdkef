---
id: "ENC-03"
title: "Unlock takes a file from another tool and opens an owner-only file with no password"
status: "done"
priority: "P1"
epic: "robustness"
depends_on: ["ENC-01"]
---

# ENC-03 · Unlock takes a file from another tool and opens an owner-only file with no password

*Plan section 3.* Unlock today cannot open a file that only has an owner password: it detects "encrypted", shows the password field, the submit button is disabled while the field is empty (`PdfSecurityTool.tsx:183`) and `handleSubmit` returns early without one (`:93`), so no input works. `unlockPdf(file, '')` does (run: intact, text and pixels preserved, permissions gone). Unlock also has no hand-off receiver.

## Brief
- Receive a hand-off on mount (`useHandoffIntake('unlock', ...)`, which feeds the tool's own `handleFilesAdded`; mind its `application/pdf` filter). A file that needs a password then shows the existing prompt, as if the person had picked it there.
- Classify with the ENC-01 classifier. `owner-restricted` runs the empty-password unlock straight away: no password field, one line ("No password needed. This takes the protection off."). Both the disabled button and the `handleSubmit` guard change.
- Wrong password versus damaged: `unlockPdf` maps every load failure to `WrongPasswordError` (`security.js:45-54`) and the text is hard-coded at `PdfSecurityTool.tsx:193` ("The password may be incorrect."). Tell them apart and say the right thing for each.

## Acceptance
- Unit: an owner-only fixture unlocks with no input; a needs-password fixture still shows the field; a wrong password and a damaged file give different messages; a handed-off file loads.
- Arriving from Redact, Unlock opens with the file already loaded and no empty-tool flash; reviewed at 1280 and 375.

## Result

Shipped in `2877afd2`. Unlock receives the hand-off, classifies with the ENC-01 probe, opens an owner-only file with no password field ("No password needed. This takes the protection off."), and tells a wrong password from a damaged file. `isPdfEncrypted` is removed. Checked at 1280 and 375.
