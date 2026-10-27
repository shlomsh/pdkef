---
id: "ARCH-77"
title: "End-to-end specs share one fixture and navigation helper module"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
order: 9
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

- [ ] `git grep "async function makePdfBuffer" -- '*.spec.js'` finds only the support module.
- [ ] Test counts per Playwright project unchanged; CI green.
