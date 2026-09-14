---
id: "ARCH-21"
title: "Split the site project so a page-only or content-only commit narrows instead of running everything"
status: "open"
priority: "P3"
epic: "module-boundaries"
phase: "longer-term"
depends_on: ["ARCH-20", "QUAL-08"]
---

# ARCH-21 · A page-only commit should not run every tool's tests

*Filed 2026-09-14* from `docs/nx-affected-ci.md`'s follow-ups. Do not start before QUAL-08 says
page-only commits are frequent enough to matter.

## Problem

`site` is one Nx project rooted at `src/` (pages, layouts, content, data, i18n, styles, test
helpers, the `.astro` components). Every tool imports `src/i18n/` and `src/data/`, and
`src/lib/useWorkspaceGestures.ts` imports `src/i18n/toolMessages.ts` at runtime, so `site` is a
dependency of everything; `scripts/affected-scope.mjs` therefore treats it as a core project and any
change under `src/pages/` or `src/content/` runs the full unit and e2e suites. ARCH-15 measured
page/content-only commits at 34 of 200. Nx also cannot see `.astro` imports, so a page's edge to the
island it hosts is invisible and would have to be declared by hand.

## Scope

- Split `site` into what tools import (`src/i18n/`, `src/data/`: a `site-shared` project, still core
  for `affected-scope.mjs`) and what only the static surface owns (`src/pages/`, `src/layouts/`,
  `src/content/`, `src/styles/`, `src/components/`: `site-pages`, not core). Keep `src/test/` helpers
  where every project can reach them (today: owned by `site`, everyone depends on it; decide whether
  they move to `site-shared` or get their own project that is core).
- Declare the edges Nx cannot infer: `site-pages` hosts every island, so a page change must run
  `site-e2e` (already implicit) and, for a tool page, that tool's e2e. Either `implicitDependencies`
  from each `tool-*` project on `site-pages` (simple, but then every page change runs every tool's
  e2e, which is most of what we run today anyway) or a small map in `affected-scope.mjs` from
  `src/pages/<tool>.astro` to `tool-<tool>` (precise, one more hand-kept list). Measure both on
  QUAL-08's window before choosing.
- `src/lib/useWorkspaceGestures.ts -> src/i18n/toolMessages.ts` stays; it is a `site-shared` edge
  and does not widen page-only commits once the split exists.
- Update `docs/nx-affected-ci.md`'s project table and the `CORE_PROJECTS` set, with the unit tests
  in `src/lib/affectedScope.test.js` extended for the new project names.

## Acceptance

- A commit touching only `src/content/**` or a non-tool page runs `site-pages`'s unit tests and
  `site-e2e`, and nothing else; a commit touching `src/pages/sign.astro` also runs `tool-sign`'s e2e.
- A commit touching `src/i18n/` or `src/data/` still runs everything.
- The share of `everything` runs on QUAL-08's table drops by the page-only share it measured.
