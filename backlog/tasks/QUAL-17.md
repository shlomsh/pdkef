---
id: "QUAL-17"
title: "The IRS 1040 saved-file check test finishes inside its timeout under a full run"
status: "in_progress"
priority: "P2"
epic: "site-quality"
phase: "near-term"
depends_on: []
---

# QUAL-17 · The IRS 1040 saved-file check test finishes inside its timeout under a full run

`src/tools/redact/check/realForms.test.js` IRS 1040 (2024) times out at 5s when the whole suite runs in parallel, and passes alone. Find where the time goes and make the test cheaper; a raised timeout is the fallback, with the measurement in this ticket.

## Acceptance
- Passes in three consecutive full `npm test` runs.
