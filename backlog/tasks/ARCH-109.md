---
id: "ARCH-109"
title: "Redact moves its effect clusters into hooks over the reducer state"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
depends_on: []
---

# ARCH-109 · Redact moves its effect clusters into hooks over the reducer state

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding P5.
Area: Code. Criterion: Thin components over pure logic. Structure only: no behaviour change.

## Why

- Redact has a reducer, but the island at `src/tools/redact/PdfRedactTool.tsx:115` keeps 54 hooks, 13 refs and 12 effects in a 1,204-line function.

## Outcome

- Effect clusters moved into hooks that consume the reducer state.

## Acceptance

- [ ] The island has fewer hook calls and effects than the recorded counts, and the records are lowered.
