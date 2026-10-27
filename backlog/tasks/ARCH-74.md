---
id: "ARCH-74"
title: "The swallowed-errors check covers api/ and middleware, and expected reasons carry words"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-74 · The swallowed-errors check covers api/ and middleware, and expected reasons carry words

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Safety nets. Criterion: Error handling and async. Structure only: no behaviour change.

## Why

- `scripts/check-swallowed-errors.mjs:23` walks `src/` only; `api/report.ts:166-168` drops an error with only `console.error`, and `middleware.ts` is not covered.
- The check accepts any text after `// expected:`, including `draftStore.js:291`: `// expected: ditto`.

## Outcome

- The walk includes `api/` and `middleware.ts`; a reason needs at least a few real words.

## Acceptance

- [x] `api/report.ts:166` reports or explains; a planted `// expected: ditto` fails.

## Done (2026-10-27)

The swallowed-errors check walks src/, api/ and middleware.ts, and an expected reason needs four words; api/report.ts explains why the error sink only logs. A planted `// expected: ditto` fails.
