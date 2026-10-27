---
id: "ARCH-44"
title: "Imports across layers use one path alias per layer"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
order: 2
depends_on: []
---

# ARCH-44 · Imports across layers use one path alias per layer

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Architecture. Criterion: Layering and dependency direction. Structure only: no behaviour change.

## Why

- 284 non-test imports climb three or more folders (`../../..`) and 32 climb four or more; 114 of them are in `src/tools/sign/components` and 31 in `sign/fill`. A folder move rewrites many files.

## Outcome

- Aliases such as `#lib/`, `#editor/`, `#shell/` exist in `tsconfig.json` and Vite, and the boundary script and import graph resolve them.
- Deep relative imports across layers are rewritten to aliases.

## Acceptance

- [ ] No non-test import climbs four or more folders.
- [ ] The import graph and affected-scope tests pass with aliases in place.
