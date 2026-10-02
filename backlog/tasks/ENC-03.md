---
id: "ENC-03"
title: "Unlock opens an owner-only file with no password, takes a file from another tool, and sends it back"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "next"
order: 3
depends_on: ["ENC-02"]
---

# ENC-03 · Unlock opens an owner-only file with no password, takes a file from another tool, and sends it back

*Plan section 2 and 3.* Unlock today cannot open a file that only has an owner password: it detects
"encrypted", shows the password field, and the button is disabled while the field is empty
(`PdfSecurityTool.tsx:179`), so no input works. `unlockPdf(file, '')` does (run: intact, text and pixels
preserved, permissions gone). Unlock also has no receiver for a hand-off and no way back.

## Brief

- Classify with the ENC-01 classifier. `owner-restricted` runs the empty-password unlock straight away: no
  password field, one line ("No password needed. This takes the protection off."), one button.
- Receive a hand-off on mount (`useHandoffIntake('unlock', ...)`, which feeds the tool's own
  `handleFilesAdded`; mind its `application/pdf` filter) and read `?from=` against the closed list.
- Done state: the existing Download and Share, then, when `from` is set and valid, one quiet verb with that
  tool's icon, "Continue in <Tool>", which calls `returnFromUnlock` with the original file name. Never in
  front of Download. Without `from`, the done state is unchanged.
- Stop saying "The password may be incorrect" for a damaged file: `unlockPdf` maps every load failure to
  `WrongPasswordError` (`security.js:46-54`). Tell wrong password from damaged.
- Output name stays `<name>_unlocked.pdf` for the standalone download.

## Acceptance
- Unit: an owner-only fixture unlocks with no input; a needs-password fixture still needs the field; a
  wrong password and a damaged file give different messages; `from=redact` shows "Continue in Redact",
  `from=evil` shows nothing extra.
- The returned file is byte-for-byte what Download would have given, and `getPermissions()` on it is `null`.
