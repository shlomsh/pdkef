---
id: "QUAL-19"
title: "Sign's corpus scoring test sets up inside its hook timeout under a full run"
status: "done"
priority: "P2"
epic: "robustness"
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

## Done (2026-10-01)

Measured: nothing was repeated. Each of the ten forms is read and scored once and the results were
already shared. The single `beforeAll` scored all ten in sequence: 1.3s alone, 3-4s with another
suite running (load average ~18); Thai PND90 is the largest form (0.4s alone, 1.0s loaded). The
ticket's 10.5s did not reproduce warm and was likely a cold or saturated run.

Fix: one `beforeAll` per form, inside its own `describe.each` block, so the 10s limit applies to the
slowest single form (~1s loaded) instead of the sum. Assertions unchanged, no timeout raised.

Acceptance: three full `npx vitest run` passes, each with `npx vitest run src/tools/sign` running in
parallel: 5781 passed, 0 failed each time; the file took 2.4-2.7s. Alone it is 112 tests in 1.7s.
