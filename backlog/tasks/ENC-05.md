---
id: "ENC-05"
title: "The round trip is tested across pages against a real protected file"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "now"
order: 4
depends_on: ["ENC-02", "ENC-04"]
---

# ENC-05 · The round trip is tested across pages against a real protected file

*Plan section 8.* No spec exercised a protected file because the repo had none; this is the spec that would have caught the original report.

## Brief
- `e2e/handoff/encrypted-roundtrip.spec.js` (it visits two tools' routes, so it lives in `e2e/handoff/`, not under a tool folder: module-boundaries rule 7). Case 1, owner-only: the file in Redact shows the state and no `tool_operation_failed` beacon is sent; Unlock it; Unlock has the file and opens it with no prompt; Redact it; Redact has the editor; draw a box; Save; the download opens in pdf.js with the box's text gone. Case 2, needs a password: the prompt appears, a wrong password is refused, the right one unlocks. Chromium only.
- Run `npm run check:e2e` before landing, on an unusual `PLAYWRIGHT_PORT`.

## Acceptance
- Case 1 is red on `main` before ENC-02 (run it red first), green after.
