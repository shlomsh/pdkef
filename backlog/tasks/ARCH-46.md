---
id: "ARCH-46"
title: "Single-tool modules leave the editor core, and rule 9 covers src/editor"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 2
depends_on: []
---

# ARCH-46 · Single-tool modules leave the editor core, and rule 9 covers src/editor

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Architecture. Criterion: Cohesion and organization. Structure only: no behaviour change.

## Why

- Seven modules in the headless editor core are used by one tool: `src/editor/adapters/pdf/sign.js`, `fieldLabels.js`, `applyPageEdits.js`, `src/editor/model/carriedPatch.ts`, `elementDefaults.ts`, `src/editor/workspace/signatureImagePolicy.ts`, `src/editor/text/fieldOrder.ts`.
- Rule 9 (a common-layer module needs two consumers) exempts `src/editor`, so the check does not see them.

## Outcome

- Each moves under its tool, or into an explicit `editor/<tool>-adapters/` folder the rule recognises.
- Rule 9 applies to `src/editor`.

## Acceptance

- [ ] Rule 9 reports no single-consumer module in `src/editor`.
