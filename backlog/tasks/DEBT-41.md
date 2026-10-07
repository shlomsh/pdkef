---
id: "DEBT-41"
title: "Split checks for a protected PDF when the file is added"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# DEBT-41 · Split checks for a protected PDF when the file is added

*Found 2026-10-06 in the daily error read.* A password-protected PDF reached Split's prepare step,
where `splitPdf` threw "This PDF is password protected." Split rebuilt the output 4 times, failed each
time and sent 1 error report. Compress and Unlock check the file with `probeEncryption`
(`src/lib/pdfEncryption.ts`) when it arrives. Split never did, so the person's file got all the way to
a catch, and per the "Catching errors" rule a catch that receives one is ours.

## Scope

- Split runs `probeEncryption` when a file is added, the way Compress does. A `needs-password` or
  `owner-restricted` file never starts a prepare run. It shows the protected-file state that points to
  Unlock, and nothing is reported.
- `splitPdf`'s own `isEncrypted` throw stays as the backstop.

## Acceptance

- [x] A unit test with a protected file fails before the change and passes after: no prepare run, no report.
- [x] An open file splits as before.

## Outcome

Shipped in `378bed4d`. Split probes the file with `probeEncryption` as soon as it is added. A `needs-password` or
`owner-restricted` file shows "This PDF is protected. Open it in Unlock first, then split it here." in
place of the page grid, never starts a prepare run, and reports nothing. If the probe itself throws, it
reports `check_encryption` and the file loads as before.
