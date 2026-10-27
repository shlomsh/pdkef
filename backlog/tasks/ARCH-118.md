---
id: "ARCH-118"
title: "More JavaScript folders are type-checked through checkjs-folders.json"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
depends_on: []
---

# ARCH-118 · More JavaScript folders are type-checked through checkjs-folders.json

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding T2.
Area: Safety nets. Criterion: Type safety. Structure only: no behaviour change.

## Why

- `scripts/checkjs-folders.json` lists only `src/editor/adapters/pdf`; 144 `.js` files (21.8k lines) stay unchecked and only the count is ratcheted.

## Outcome

- Folders added to `checkjs-folders.json` one at a time, starting with `src/lib/drafts`.

## Acceptance

- [ ] `src/lib/drafts` is type-checked in `check:fast`.
- [ ] Each added folder passes `tsc` with no new `@ts-nocheck`.
