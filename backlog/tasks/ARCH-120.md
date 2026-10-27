---
id: "ARCH-120"
title: "The floating-promise check uses the TypeScript checker"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-120 · The floating-promise check uses the TypeScript checker

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding E5.
Area: Safety nets. Criterion: Error handling and async. Structure only: no behaviour change.

## Why

- `scripts/check-floating-promises.mjs:12` has no type checker, so bare calls to imported async functions (`useMergeFiles.ts:95`) are not seen.

## Outcome

- The TypeScript checker used for the promise-type test.

## Acceptance

- [ ] A planted bare call to an imported async function fails the check.
