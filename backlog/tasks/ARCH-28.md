---
id: "ARCH-28"
title: "Unit tests run by file impact, not by project: a core-folder change runs the tests that import it"
status: "done"
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

## Result (2026-09-25)

`scripts/unit-scope.mjs` chooses unit tests with `vitest related <changed files>` plus a
`WIDEN_RULES` table for everything the import graph cannot see (tests that read files by path, the
whole-`src` scan guards, fixtures, fonts, `backlog/`, licenses text). The whole suite runs for global
config, `.github/workflows/**`, the three scripts that compute the diff or scope, any deletion, an
empty diff, or a `vitest related` spawn error. CI's `checks` job, `check:push` and `check:fast` all
select through it. Nx still decides e2e, font guards and export guards.

Measured on single-file changes (unit files selected, before -> after): `src/lib/drafts/draftStore.js`
193 -> 18, `src/shell/BasePdfTool.tsx` 193 -> 18, `src/tools/sign/PdfSignTool.tsx` 63 -> 7,
`vitest.config.js` 193 -> 193. Wall time moves less than file count (whole suite ~16s, a narrow set
~9s): Vitest's startup dominates.

Audit: all 8 CI runs since 2026-09-01 whose unit step failed would still select the failing test.
7 widen to the whole suite (5 dependency bumps via `package*.json`, 1 oracle-script change and
deletion, 1 `ci.yml` change); in the 8th the failing test was itself a changed file. The replay found
that the `ci.yml` case (run 34890208527) had been covered only by luck, which is why workflow changes
now widen. A fresh review then found three more by-path reads (`.astro`/`.mjs` for the import-scan
guard, `THIRD_PARTY_LICENSES.md` and `licenses.astro` for `fontAttribution.test.js`, and
`PdfSignTool.test.tsx`'s font read), all now rules with tests.

Known trade-off: a source file with no test importers and no rule now runs no unit tests, where the
project-level scope used to run its folder's tests anyway.
