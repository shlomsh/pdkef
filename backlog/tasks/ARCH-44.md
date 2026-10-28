---
id: "ARCH-44"
title: "Imports across layers use one path alias per layer"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
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

- [x] No non-test import climbs four or more folders.
- [x] The import graph and affected-scope tests pass with aliases in place.

## Done (2026-10-28)

- The aliases live in package.json "imports" rather than tsconfig `paths` plus a Vite alias: Node, Vite, Vitest
  (`vi.mock` in both directions), TypeScript and Nx all read that one field, so no table is duplicated. A spike showed
  TypeScript resolves an alias only with the file's real extension, so every aliased specifier names it.
- `scripts/import-aliases.mjs` is the one table the scripts map through. import-graph, check-module-boundaries,
  check-untested-modules, affected-scope, check-editor-dependency-directions, check-unused-exports (imports and
  `import()` types), check-island-boundary and check-class-resolution follow an alias like its relative spelling,
  each with a test seen failing first.
- 1,453 cross-layer specifiers under src/ rewritten (imports, export-from, dynamic imports, the vi mock family).
  Non-test climbs: 3+ folders 795 -> 2, 4+ folders 99 -> 0.
- `npm run test:import-aliases` holds the rule (docs/module-boundaries.md, "Import aliases") in CI, check:push and
  check:fast.
- Proof of no behaviour change: the Nx project graph is identical (203 edges), and 361 of 365 dist files are
  byte-identical. The other four follow from the sitemap: `/` and `/he/` take their git-derived lastmod from home
  components whose import lines were rewritten, and the build id (in about, sw.js and the precache manifest) hashes dist.
