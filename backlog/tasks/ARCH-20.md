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
