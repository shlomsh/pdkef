---
id: "ARCH-119"
title: "Draft records enter the code through one parse function per type"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-119 · Draft records enter the code through one parse function per type

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding T5.
Area: Safety nets. Criterion: Type safety. Structure only: no behaviour change.

## Why

- `src/lib/drafts` and `src/tools` carry 39 `as unknown as` and `as DraftRecord` casts.

## Outcome

- One parse function per record type.

## Acceptance

- [ ] The cast count is lower than 39 and the parse functions have tests.
