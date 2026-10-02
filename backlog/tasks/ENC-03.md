---
id: "ENC-03"
title: "Unlock opens an owner-only file with no password and takes a file from another tool"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "now"
order: 3
depends_on: ["ENC-02"]
---

# ENC-03 · Unlock opens an owner-only file with no password and takes a file from another tool

*Plan sections 2 and 3.* Unlock today cannot open a file that only has an owner password: it detects "encrypted", shows the password field, the submit button is disabled while the field is empty (`PdfSecurityTool.tsx:183`) and `handleSubmit` returns early without one (`:93`), so no input works. `unlockPdf(file, '')` does (run: intact, text and pixels preserved, permissions gone).

## Brief
- Classify with the ENC-01 classifier. `owner-restricted` runs the empty-password unlock straight away: no password field, one line ("No password needed. This takes the protection off."), one button. Both the disabled button and the `handleSubmit` guard change.
- Receive a hand-off on mount (`useHandoffIntake('unlock', ...)`, which feeds the tool's own `handleFilesAdded`; mind its `application/pdf` filter) and read `?from=` against the map from ENC-02.
- Wrong password versus damaged: `unlockPdf` maps every load failure to `WrongPasswordError` (`security.js:45-54`) and the text is hard-coded at `PdfSecurityTool.tsx:193` ("The password may be incorrect."). Tell them apart and say the right thing for each. (`isPdfEncrypted` already turns an unparsable file into "could not be read"; this is the other path.)

## Acceptance
- Arriving from a tool, Unlock opens with the file already loaded and one obvious action, not an empty tool; reviewed at 1280 and 375.
- Unit: an owner-only fixture unlocks with no input; a needs-password fixture still shows the field; a wrong password and a damaged file give different messages; an unknown `from` is ignored.
