---
id: "ARCH-66"
title: "Hooks and effects per component are a ratchet"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
order: 11
depends_on: ["ARCH-76"]
---

# ARCH-66 · Hooks and effects per component are a ratchet

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Thin components over pure logic. Structure only: no behaviour change.

## Why

- 20 components have more than 10 hooks and 9 more than 20; 43 of the 128 `useEffect` calls sit in five islands. Nothing stops an island from growing back after a reducer refactor.

## Outcome

- A check records hook and effect counts per component and fails when one rises.

## Acceptance

- [ ] Adding an effect to a recorded component fails CI; removing one lowers the record.
