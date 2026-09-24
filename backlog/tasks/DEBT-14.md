---
id: "DEBT-14"
title: "Editor-time boundary feedback: ESLint with @nx/enforce-module-boundaries on the existing project tags, or retire the idea with Nx"
status: "retired"
priority: "P3"
epic: "architecture-debt"
phase: "later"
depends_on: ["DEBT-07"]
---

# DEBT-14 · Boundaries the editor shows, not only CI

*Filed 2026-09-14* while landing DEBT-02, from Shlomi's question: why is a cross-module import caught
by a check and not at compile time?

## Problem

`test:module-boundaries` is static (an import scan, ~2s, first in `check:fast`), so it is the JS
equivalent of a compile step; what it cannot be is a language guarantee, because JavaScript has no
module visibility: an import is a file path and anything that exists resolves. The result is that an
agent or a person sees a forbidden edge only when the check runs, never as a red squiggle while
typing. The two ways to move the feedback earlier:

- **ESLint with `@nx/enforce-module-boundaries`.** Every `project.json` already carries the tags the
  rule needs (`scope:tool`, `tool:<name>`, `scope:site`, ...), lint does not skip test files (so rule 6
  comes for free), and the IDE plugin shows the violation while coding. Cost: ESLint is not in the
  repo today (config plus roughly 60 lock packages), and the rule speaks tags where the checker speaks
  folders, so either the two stay in sync by hand or the checker retires.
- **npm workspaces, one package per module with declared `dependencies`.** The only true
  resolution-time wall (dev server, build and `tsc` all refuse an undeclared import). Nine tool
  packages, `exports` maps, hoisting quirks; not worth it at this codebase's size. Recorded so it is
  not re-proposed.

TypeScript project references are the third option and the weakest: `astro check` would refuse the
edge but Vite still bundles it, and `.astro` files sit awkwardly across the boundary.

## Scope

Decide together with DEBT-07, since the answer depends on whether Nx stays:

- **Nx stays**: add ESLint (flat config) with `@nx/eslint-plugin`'s `enforce-module-boundaries` driven
  by the existing tags; a `depConstraints` table that expresses rules 1-6 of `docs/module-boundaries.md`;
  `npm run lint` in `check:fast` before `test:module-boundaries`. Then either delete
  `scripts/check-module-boundaries.mjs` (and its two tests) if the lint rule covers all six rules plus
  the shrink-only allowlist semantics, or keep it as the CI oracle and document the lint rule as the
  editor-time mirror. Rule 7 (tool spec routes, DEBT-01) is not an import rule and stays in the checker
  either way.
- **Nx leaves**: `eslint-plugin-import`'s `no-restricted-paths` with the same six rules as `zones`, or
  close this ticket as "the checker is the boundary; editor feedback is not worth a linter".

## Acceptance

- One of: a `lint` step in `check:fast` that goes red on a throwaway `import` from `src/tools/sign/`
  inside `src/tools/merge/`, in the same commit that documents which of the two tools is the oracle;
  or this ticket closed as retired with the decision recorded in `docs/module-boundaries.md`.
- `check:fast` stays under 30s locally.

## Retired (2026-09-24)

Decision: the checker is the boundary; editor-time feedback is not worth a linter. ESLint cannot see
`.astro` files or `<script src>` consumers, and cannot express rule 6 (test laundering), rule 8
(nothing imports `scripts/`) or ARCH-25's two-consumer rule, so `check-module-boundaries.mjs` would
have to stay and the tags would become a second definition of every boundary, kept in sync by hand.
The check runs in about 2s at the top of `check:fast`, so a forbidden import is still caught before a
push. The Nx project tags were read by nothing (not the checker, not `affected-scope.mjs`, which
names projects `tool-*`) and were deleted from all 23 `project.json` files in the same change;
`affected-scope.mjs` resolves the same projects without them. Recorded in
`docs/module-boundaries.md` and `docs/nx-affected-ci.md`.
