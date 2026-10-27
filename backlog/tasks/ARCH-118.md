---
id: "ARCH-118"
title: "More JavaScript folders are type-checked through checkjs-folders.json"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
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

- [x] `src/lib/drafts` is type-checked in `check:fast`.
- [x] Each added folder passes `tsc` with no new `@ts-nocheck`.

## Closed 2026-10-27

`src/lib/drafts` is in `checkjs-folders.json`; each .js file starts with `// @ts-check` and passes the `tsc` that `check:fast` runs, with JSDoc only. Red run: 3 missing headers, then 21 tsc errors. `clearDraft` resolves a boolean but keeps its documented `Promise<void>` through a cast, noted in the hook's doc block.
