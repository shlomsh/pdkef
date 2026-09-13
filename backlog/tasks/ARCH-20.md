---
id: "ARCH-20"
title: "Adopt Nx on the drawn boundaries: one project per module, tags that enforce the rules, affected-only tests in CI and locally"
status: "open"
priority: "P2"
epic: "module-boundaries"
phase: "longer-term"
depends_on: ["ARCH-17", "ARCH-18", "ARCH-19"]
---

# ARCH-20 · Nx, once there are modules for it to see

## Problem

The 2026-09-13 spike (branch `spike/nx`, commit `87c1ed1`, 23 `project.json` files plus `nx.json`,
485 lines, no file moves) showed that Nx's `@nx/js` import analysis infers the dependency graph from
plain relative imports with no tsconfig paths, that an `nx show projects --affected` call is about
0.5s warm, and that on the flat layout it cannot place a single one of the last 200 commits in a
single-tool bucket (the ideal, file-level scoping places 34 there). With ARCH-16 to ARCH-19 landed,
the projects are real folders and the same configuration becomes precise.

Measured value on the last 200 commits, once the buckets are reachable: 34 single-tool and 34
site-only commits skip the other tools' unit and e2e work; about half of the product e2e time
(1:50 on two CI workers) on those runs, plus the font guards whenever the export graph is untouched.

## Scope

- Recreate the spike's projects on the new layout: `shell`, `editor`, `editor-ui`, `lib`, one per
  `src/tools/<tool>` (each with `test` and `e2e` targets), `fonts` (`public/fonts` plus the font
  guards, depending on `editor`), and the site. Keep it to `project.json` files and `nx.json`; no
  workspace conversion.
- Enforce the rules from `docs/module-boundaries.md` with tags (`scope:tool`, `scope:shell`,
  `scope:editor`, ...) and either `@nx/enforce-module-boundaries` (needs ESLint, which the repo
  does not have) or by keeping `scripts/check-module-boundaries.mjs` reading `nx graph --file`.
  Pick the one that costs less; do not end with two checkers.
- `ci.yml`: the `scope` job keeps the docs-only verdict; the `checks` and `build` jobs run
  `nx affected -t test` and `nx affected -t e2e --base=<base> --head=<head>` instead of everything,
  with the cross-tool specs (`tool-layout`, `tool-output-paths`, `csp-smoke`, `offline`, `demo`,
  `home`, `localized`, `content`) as a `site-e2e` project that every tool touches. The `fonts`
  project replaces `scripts/change-scope.mjs`'s hand-kept input list; the nightly run still runs
  everything. Fails open exactly as today when no base resolves.
- Locally: `npm run check:fast` uses `nx affected -t test` in place of `vitest --changed`, and
  `npm run test:e2e` runs `nx affected -t e2e`.
- Record the numbers before and after on a week of runs in the ticket.

## Acceptance

- A Compress-only commit (the spike's counter-example was `e5fcadd`, 17 of 23 projects affected)
  affects `compress` and `site-e2e` and nothing else.
- A docs-only commit still takes about 30s end to end; a shared-core commit still runs everything.
- `test:licenses` unchanged (nx is a devDependency); `check:guidance` green; the Nx cache directory
  ignored.

## Notes

- Landed on `arch-20` (forked from `main` at `27c637f`, after ARCH-15 through ARCH-19), commits
  `31c5af2` (nx as a devDependency, `nx.json`, one `project.json` per module), `414cfba`
  (`scripts/affected-scope.mjs`, the local `test:affected`/`test:e2e` scripts), `dc55b7a` (test
  coverage for the ownership mapping), `04bd9ad` (`ci.yml` runs the affected unit tests and product
  e2e, font guards gate on the `fonts` project), `8a49ceb` (two real `e2e_paths` bugs found only by
  exercising the CLI end to end - see `docs/nx-affected-ci.md`). Full detail, the project table, the
  `run-many` vs. `npm test` measurement and the histogram are in `docs/nx-affected-ci.md`; this note
  is the summary.
- **`@nx/js` is not installed, and should not be** - not merely "unnecessary." With it installed,
  two cross-tool test files (`draftCheckingPlaceholder.test.tsx`/`draftRestoreRace.test.tsx`, plus
  `textCoverage.test.js`) give Nx a real `editor -> tool-sign`/`tool-redact` edge, which collapses a
  single Sign-file change from 3 affected projects to all 17 - verified directly. Project ownership
  here is purely directory-based (`project.json` roots) plus explicit `implicitDependencies`; nothing
  needs an import-inference plugin.
- Enforcement stays `scripts/check-module-boundaries.mjs` (unchanged, still 0 of 815 edges violating a
  rule); Nx's tags exist only so `nx show projects --affected` can answer "which tool is this."
- **The histogram's 137/200 "everything" bucket is a fork-timing artifact, not a verdict that
  narrowing fails**: this worktree forked immediately after ARCH-16 through ARCH-19 landed, so ~90% of
  the 200-commit window predates the `src/tools/` layout this configuration targets, and a pre-move
  commit's own file paths are correctly "unowned" by today's projects. The mechanism narrows real,
  present-day single-tool changes directly (`src/tools/compress/PdfCompressTool.tsx` ->
  `["tool-compress","site-e2e"]`, `fonts=false`; see `docs/nx-affected-ci.md` for the full table) -
  this just was not measurable against 200 commits of history that mostly predates the layout.
- **Still open, deliberately left to the ticket's own acceptance bar**: "record the numbers before and
  after on a week of runs" needs real `ci.yml` production runs, which a single local checkout cannot
  produce - this is for whoever watches the first week of PRs against this branch once it lands on
  `main`. Also open: splitting `site` so a page-only commit narrows (today `site` is one of the five
  core projects that force `everything`, so a `src/pages/*.astro`-only change still runs everything -
  see `docs/nx-affected-ci.md`'s Follow-ups), and `check-module-boundaries.mjs`'s multi-line-import
  miss (a real, separate bug the prep spike found, out of this ticket's scope).
