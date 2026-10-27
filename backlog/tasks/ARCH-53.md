---
id: "ARCH-53"
title: "Compress runs its build and gate lifecycle through one explicit state machine"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-53 · Compress runs its build and gate lifecycle through one explicit state machine

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Thin components over pure logic. Structure only: no behaviour change.

## Why

- `src/tools/compress/PdfCompressTool.tsx:111-168` keeps the run gate twice (`runnable` and `runnableRef`, `:139-144`) beside `tapped`, `retryTap`, `runCount`, and six refs holding callbacks and tokens (`buildRef`, `failRef`, `landRef`, `runTokenRef`, `analysisTokenRef`, `optionsRef`) that render mirrors by assignment.
- The lifecycle is implied by ref order, so a change in statement order can change behaviour.

## Outcome

- One state machine module with typed states and transitions, unit-tested; the island reads from it.

## Acceptance

- [x] No duplicated state/ref pairs remain in the island.
- [x] Compress unit and e2e tests pass, including the reselect-size case.

## Done (2026-10-27)

Compress's run gate, tokens, run count and taps are one pure machine (state/compressMachine.ts) held in a single ref by useCompressMachine; no state/ref pair remains. Transition tests cover reselecting the target size and stale tokens; Compress unit and e2e tests pass.
