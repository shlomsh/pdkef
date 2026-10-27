---
id: "ARCH-116"
title: "Each tool has one id, with folder and label as the only other fields"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-116 · Each tool has one id, with folder and label as the only other fields

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding R1.
Area: Code. Criterion: Readability and naming. Structure only: no behaviour change.

## Why

- `src/lib/toolIds.ts:48`: Edit Pages is id `edit-pdf`, folder `edit-pages`, slug `organize-pdf`; Unlock/Protect is `security`, `unlock`, `protect`.

## Outcome

- One id per tool, with folder and label as the only other fields.

## Acceptance

- [ ] No tool is known by more than one id in `toolIds.ts`.
- [ ] The redirect and routing tests pass.
