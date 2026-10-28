---
id: "ARCH-107"
title: "draftStore.ts and formCells.js are split by responsibility"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-107 · draftStore.ts and formCells.js are split by responsibility

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding S7.
Area: Code. Criterion: Size and complexity. Structure only: no behaviour change.

## Why

- `src/lib/drafts/draftStore.ts` is 1,154 lines and `src/tools/sign/lib/fields/formCells.js` is 1,061, both outside the islands.

## Outcome

- Each file split by responsibility.
- The ratchet records lowered.

## Acceptance

- [ ] Neither file is over 800 lines.
- [ ] The size record shows the lower values.
