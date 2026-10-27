---
id: "ARCH-69"
title: "tsconfig states strict mode explicitly"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-69 · tsconfig states strict mode explicitly

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Safety nets. Criterion: Type safety. Structure only: no behaviour change.

## Why

- `tsconfig.json` only extends `astro/tsconfigs/base`. Strict mode is on only through the TypeScript 6.0.3 default: `tsc --strict false` yields 22 errors that strict currently catches. A changed base or compiler default would turn it off silently.

## Outcome

- `"strict": true` set in `tsconfig.json`.

## Acceptance

- [x] Typecheck green; the setting is visible in the file.

## Done (2026-10-27)

tsconfig.json sets "strict": true (tsc --strict false shows the 22 errors strict catches).
