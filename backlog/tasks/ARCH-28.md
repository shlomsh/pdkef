---
id: "ARCH-28"
title: "Unit tests run by file impact, not by project: a core-folder change runs the tests that import it"
status: "in_progress"
priority: "P1"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-27"]
---

# ARCH-28 · Unit tests run by file impact, not by project

*Filed 2026-09-25* from ARCH-27. Goal: CI and local runs execute only what a change touches or
impacts.

## Why

`scripts/affected-scope.mjs` narrows by Nx project, and any change in a core project (`site`,
`shell`, `editor`, `lib`) runs everything. That was 46 of 53 wide runs in the ARCH-22 window. On real
pushes, `vitest related <changed files> --run` selected 2 files (`editor`, `768df6f8`), 13 (`lib`,
`604bd317`) and 1 (`shell`, `c188e4aa`) where the oracle ran all 193.

## Scope

1. `unit_paths` becomes the output of Vitest's own import graph (`vitest related`) for the changed
   files, in CI and in `check:fast`.
2. Explicit widen-to-everything rules for what the import graph cannot see, each with a unit test:
   config (`vitest.config.js`, `tsconfig*`, `package*.json`, `astro.config.mjs`), `src/test/fixtures/**`
   and any other file a test reads by path, `.css`/CSS Modules, deletions and renames (a moved file
   returns zero related tests), the oracle itself. `.astro`-only changes select no unit tests, which
   is correct; the build job and e2e cover them.
3. Nx stays (Shlomi, 2026-09-25). It keeps deciding project-level scope for e2e, font guards and
   export guards; `vitest related` only refines `unit_paths` inside that scope, including for core
   projects. E2E and font-guard gating keep their current project-level rules for now.
4. Correctness audit before landing: for every CI run since `19dca856` that failed in the unit step,
   show that the failing test is in the new `unit_paths` for that push.

## Acceptance

A push touching only `src/lib/drafts/draftStore.js` runs its related unit tests, not 193 files, on a
green CI run; the audit in step 4 finds no failing test the new scope would have skipped.
