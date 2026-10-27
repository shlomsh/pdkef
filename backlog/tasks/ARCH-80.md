---
id: "ARCH-80"
title: "Test files are type-checked against the code they cover"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-80 · Test files are type-checked against the code they cover

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Tests and CI. Criterion: Test architecture. Structure only: no behaviour change.

## Why

- 60 test files carry `// @ts-nocheck` (for example `src/tools/split/PdfSplitTool.test.tsx:1`) and tests hold 183 `as any` / `as unknown as` casts, so test doubles are not checked against the signatures they stand in for.

## Outcome

- Pragmas removed gradually, fixtures first; a ratchet on the `@ts-nocheck` count.

## Acceptance

- [x] `@ts-nocheck` count below 20 and recorded.

## Closed 2026-10-27

`@ts-nocheck` in src/ is 63 -> 19, held by test:ts-nocheck-ratchet (scripts/ts-nocheck-limit.json) in check:push and CI. Every touched test keeps its assertion count; test doubles were typed against the real signatures.
