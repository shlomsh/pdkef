---
id: "ARCH-49"
title: "The import graph sees every import form, or rejects the ones it cannot read"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
order: 5
depends_on: []
---

# ARCH-49 · The import graph sees every import form, or rejects the ones it cannot read

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Architecture. Criterion: Layering and dependency direction. Structure only: no behaviour change.

## Why

- `scripts/import-graph.mjs:35` is regex-based. It ignores template-literal and computed `import()`, `import.meta.glob`, and `new URL('../x', import.meta.url)` side doors.
- None exist in non-test `src/` today, but nothing stops one, and an unseen edge escapes the boundary rules and affected-scope narrowing.

## Outcome

- The scanner resolves these forms, or fails with the file and line when it meets one it cannot resolve.

## Acceptance

- [ ] A planted computed import and a `new URL(..., import.meta.url)` each either appear as edges or fail the check.
