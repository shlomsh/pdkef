---
id: "QUAL-19"
title: "Sign's corpus scoring test sets up inside its hook timeout under a full run"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
order: 1
depends_on: []
---

# QUAL-19 · Sign's corpus scoring test sets up inside its hook timeout under a full run

*Found 2026-10-01 in a check:push run for RED-16.* `src/tools/sign/fields/corpus/scoring/scoring.test.js`
failed with "Hook timed out in 10000ms" during the full unit suite on a busy machine; alone it passes,
102 tests in 10.5s. Its setup sits close to the hook limit, the same shape as QUAL-17's IRS 1040 test.

Measure where the setup time goes and make it cheaper (load each corpus file once, share parsed results);
a raised hook timeout, with the measurement in this ticket, is the fallback.

## Acceptance
- Three consecutive full `npm test` runs pass with another suite running in parallel.
