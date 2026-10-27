---
id: "ARCH-113"
title: "The headless core marks gestureMachine.ts as parked, with its owner ticket"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-113 · The headless core marks gestureMachine.ts as parked, with its owner ticket

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding X3.
Area: Code. Criterion: Dead code and unused surface. Structure only: no behaviour change.

## Why

- `src/editor/interaction/gestureMachine.ts` (301 lines) and `constants.ts` are used only by their test (planned for SNG-04), held in the headless core with nothing saying so.

## Outcome

- Either a spec folder for them, or a mark with the owner ticket in the unused-exports check.

## Acceptance

- [ ] The files are either moved or listed with SNG-04 as owner in the unused-exports check.
