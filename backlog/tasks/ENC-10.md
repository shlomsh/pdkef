---
id: "ENC-10"
title: "The round trip and the intake of every tool are tested against a real protected file"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "next"
order: 9
depends_on: ["ENC-03", "ENC-04", "ENC-06"]
---

# ENC-10 · The round trip and the intake of every tool are tested against a real protected file

*Plan section 8.* No spec exercised a protected file because the repo had none; this is the pair that
would have caught the original report and the blank outputs.

## Brief
- `e2e/handoff/encrypted-roundtrip.spec.js` (it visits two tools' routes, so it lives in `e2e/handoff/`,
  not under a tool folder; module-boundaries rule 7): owner-only file in Redact shows the state and sends no
  `tool_operation_failed` beacon; Unlock it; Unlock arrives with the file and no password field;
  Continue in Redact; the editor mounts; draw a box; Save; the download opens in pdf.js with the box's
  text gone. Then Back from Unlock with the bfcache flags `back-navigation.spec.js` uses (the gate's
  control works again), a needs-password file with a wrong password, and reload on Unlock (file gone,
  Continue still offered once it is picked again). Chromium only; webkit's list is untouched.
- `src/test/cross-tool/encryptedIntake.test.*`: every tool's intake against needs-password, owner-only and
  plain, so a new intake path cannot skip the gate.
- Run `npm run check:e2e` before landing; use an unusual `PLAYWRIGHT_PORT`.

## Acceptance
- Both go red on `main` before ENC-04 and ENC-06, and green after (run them red first).
