---
id: "ENC-16"
title: "The round trip is tested across pages against a real protected file"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "next"
order: 10
depends_on: ["ENC-04", "ENC-05"]
---

# ENC-16 · The round trip is tested across pages against a real protected file

*Plan section 8.* No spec exercised a protected file because the repo had none; this is the spec that would have caught the original report.

## Brief
- `e2e/handoff/encrypted-roundtrip.spec.js` (it visits two tools' routes, so it lives in `e2e/handoff/`, not under a tool folder: module-boundaries rule 7). Owner-only file in Redact: the state shows and no `tool_operation_failed` beacon is sent; Unlock it; Unlock arrives with the file and no password field; Continue; Redact has the editor; draw a box; Save; the download opens in pdf.js with the box's text gone. Then Back from Unlock with the bfcache flags `back-navigation.spec.js` uses (the gate's control works again), a needs-password file with a wrong password, and a reload on Unlock (file gone, Continue still offered once it is picked again). Chromium only; the webkit list is untouched.
- Run `npm run check:e2e` before landing, on an unusual `PLAYWRIGHT_PORT`.

## Acceptance
- Red on `main` before ENC-05 (run it red first), green after.
