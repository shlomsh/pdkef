---
id: "ARCH-77"
title: "End-to-end specs share one fixture and navigation helper module"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-77 · End-to-end specs share one fixture and navigation helper module

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Tests and CI. Criterion: Test architecture. Structure only: no behaviour change.

## Why

- 31 spec files each define `async function makePdfBuffer` with slightly different bodies and 9 define `openTool` (`e2e/handoff/merge-handoff.spec.js:19`, `e2e/home/recent-files.spec.js:12`, `e2e/home/handoff.spec.js:30`). 96 of 136 specs import no shared helper.

## Outcome

- `e2e/support/pdf.js` exports `makePdfBuffer(label, opts)`; `e2e/support/tool.js` exports `openTool(page, route)`; every spec uses them.

## Acceptance

- [x] `git grep "async function makePdfBuffer" -- '*.spec.js'` finds only the support module.
- [x] Test counts per Playwright project unchanged; CI green.

## Done (2026-10-27)

e2e/support/pdf.js (makePdfBuffer(label, opts)) and e2e/support/tool.js (openTool(page, route, opts)) replace 31 and 8 local copies; Playwright --list counts identical per project; the full e2e suite passed.
