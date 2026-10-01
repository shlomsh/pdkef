---
id: "QUAL-17"
title: "The IRS 1040 saved-file check test finishes inside its timeout under a full run"
status: "done"
priority: "P2"
epic: "site-quality"
phase: "near-term"
depends_on: []
---

# QUAL-17 · The IRS 1040 saved-file check test finishes inside its timeout under a full run

`src/tools/redact/check/realForms.test.js` IRS 1040 (2024) times out at 5s when the whole suite runs in parallel, and passes alone. Find where the time goes and make the test cheaper; a raised timeout is the fallback, with the measurement in this ticket.

## Acceptance
- Passes in three consecutive full `npm test` runs.

## Result
- Alone: 1040 test 1381ms, I-9 516ms, Hebrew 392ms. In the 1040, load 13ms, page text 47ms, pick loop ~1000ms (15 candidate words; findMatches ~250ms of it, glyph reads 47ms, the rest pdf.js cold start in the first test of the file). Nothing in production code was inefficient enough to fix.
- Nothing to trim without weakening the test, so the fallback: a 30s per-test timeout on the 1040 test.
- Three full `npm test` runs: all passed (278 files, 5129 tests). A fourth verbose run showed the 1040 test at 1775ms under the full parallel run.
