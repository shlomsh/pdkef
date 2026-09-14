---
id: "DEBT-06"
title: "editor-ui leaves CORE_PROJECTS: the first change whose affected set the Nx graph decides"
status: "open"
priority: "P1"
epic: "architecture-debt"
phase: "quick-win"
depends_on: ["DEBT-01", "DEBT-02"]
---

# DEBT-06 · Let the graph decide where it is provably right

*Filed 2026-09-14*, finding 1 of
[docs/architecture-debt-review-2026-09-14.md](../../docs/architecture-debt-review-2026-09-14.md).

## Problem

`scripts/affected-scope.mjs` widens to `everything` for `editor-ui`, but every consumer of
`src/editor-ui/*` is Sign or Redact (measured on the import graph and confirmed by
`nx show projects --affected --files=src/editor-ui/ElementToolbar.tsx`, which answers `editor-ui,
tool-sign, tool-redact, fonts, cross-tool-tests, site-e2e`). Rule 3 discards the one answer inference
gets more precise than directory ownership. Tool pages' Tailwind `@source` lists name no island files,
so there is no CSS side channel to a third tool.

## Scope

- Remove `editor-ui` from `CORE_PROJECTS`; the rest of `deriveScope()` already maps the affected tool
  projects to paths.
- `unit_paths` for an `editor-ui` change must include `src/editor-ui/` itself: add the affected
  non-tool, non-core project roots (from the `roots` map) to `unit_paths`, so `editor-ui`'s own 58 unit
  tests run.
- Cases in `src/lib/affectedScope.test.js`: an `editor-ui`-only change narrows to Sign, Redact,
  `src/editor-ui/`, `src/test/`, fonts=true; a `shell` change still widens.
- Update rule 3 in the script header and the table in `docs/nx-affected-ci.md`.

## Acceptance

- `node scripts/affected-scope.mjs` on an `src/editor-ui/`-only diff prints `everything=false`,
  `unit_paths=src/editor-ui/ src/tools/redact/ src/tools/sign/ src/test/`, `fonts=true`.
- One green CI run on such a commit, with the `Affected scope` step summary showing the narrow verdict.
