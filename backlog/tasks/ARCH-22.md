---
id: "ARCH-22"
title: "Give scripts/ real Nx ownership, folder by folder, so touching it stops forcing every test to run"
status: "in_progress"
priority: "P2"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-20", "QUAL-08"]
---

# ARCH-22 · scripts/ is unowned, so touching any of it runs everything

*Filed 2026-09-18*, from QUAL-08's measurement: of 55 real CI runs, 25% ran everything because they
touched a file under `scripts/` that no Nx project's root covers. `ownerOf()` in
`scripts/affected-scope.mjs` walks each project's declared `root` and returns `null` for any file
under `scripts/`; that `null` alone triggers `wide()` - the full unit suite, both e2e shards and all
27 font guards - regardless of what the file actually does. This is a different mechanism from the
`CORE_PROJECTS` widening a Merge/Sign editor-core change correctly triggers; it fires first and is
purely about ownership, not reach.

## What's actually in scripts/ (108 files, from a full-file agent inventory 2026-09-18)

It is not one thing. It splits into about a dozen concerns that share nothing but a directory:
the CI-scope oracle itself (`affected-scope.mjs`, `change-scope.mjs`); module/editor boundary guards
(`check-module-boundaries.mjs`, `check-editor-dependency-directions.mjs` + its fixture trees,
`check-gesture-golden-rule.js`, `check-editor-global-css.js`); CSS/build-output guards
(`check-class-resolution.js`, `check-dead-utilities.js`, `check-css-duplication.js`,
`check-page-weight.js`); deploy correctness (`verify-csp.js`, redirect checks); the build/asset
pipeline (`sync-pdfjs-wasm.mjs`, precache manifest, build-id); the font pipeline (glyph-alignment
guard, font manifest/coverage generators, `.py` subsetters); SEO tooling (`verify-seo.js`,
`seo-refresh.mjs`, research scripts); backlog/board tooling (`backlog-data.mjs`,
`generate-backlog.mjs`); licensing/governance checks; and Sign's MOBI-10 spike
(`scripts/spike/mobi-10/**`, which wraps real product code now living in
`src/editor/adapters/pdf/formCells.js`/`fieldLabels.js` - a real, one-way edge into `editor`).

Almost none of the rest have any import edge into `src/` at all - they are, as observed, external
helpers the tree does not depend on and that do not depend on the tree. A change to one should
invoke, at most, its own `.test.mjs`, never a tool's or the site's suite.

## The complication: ownership is by directory, not by file

`ownerOf()` matches a changed file's path against the *longest matching directory prefix* among all
declared project roots (read live from `nx graph`, never a hand-written list) - the same mechanism
that lets `cross-tool-tests` (`src/test/cross-tool/`) nest inside `site-test`'s root (`src/test/`)
and win the more specific match. Two projects cannot both claim overlapping ownership of the same
flat directory. Most of the concerns above already live as disjoint sibling files directly inside
`scripts/` (`backlog-data.mjs`, `check-module-boundaries.mjs`, `verify-seo.js`, `sync-pdfjs-wasm.mjs`,
...), not already sorted into subfolders - so most of this work is a real file-move refactor
(new `scripts/<concern>/` subfolders, updating every `package.json` script entry, every `ci.yml`
`run:` line, and any relative import between scripts that references the old path), not just adding
`project.json` files.

Three concerns are the exception and already live in their own subfolder today, needing only a
`project.json` and no file moves or shared-file edits at all:
- `scripts/spike/mobi-10/` (Sign's MOBI-10 spike; one real edge into `editor`)
- `scripts/fixtures/editor-dependency-directions/` (fixture trees for the editor boundary checker)
- `scripts/fonts/` (the three Python font-subsetting scripts; not npm-scripted, hand-run only)

## Plan

**Tier 1 (this pass): the three already-nested folders above.** Each gets its own narrow leaf
`project.json` - `projectType: library`, `sourceRoot` at the subfolder, a `scope:tooling` tag, no
`test` target needed (nothing in this repo runs `nx run <project>:test`; CI always calls
`vitest run <paths>` directly per `docs/nx-affected-ci.md`, so ownership alone is what `ownerOf()`
needs). None of the three touch `package.json` or `ci.yml`, so they are safe to build in parallel.
Each is verified by confirming `nx show projects --affected --files=<a file in it>` narrows to just
that project (plus `editor` for the spike, which is expected), and that `npm run check:fast` still
passes.

**Tier 2 (follow-up, split into its own ticket once Tier 1 lands): the flat-file groups.** Backlog
tooling, SEO tooling, CSS/build-output guards, the font `.mjs` generators, deploy correctness,
licensing/governance, and the module-boundary checkers themselves each need a real move into a new
`scripts/<concern>/` subfolder plus every reference to the old path updated in the same commit
(`package.json`, `ci.yml`, any script-to-script relative import). This is real refactor risk - ARCH-20's
own history records a first attempt at a narrow project quietly widening everything anyway over one
overlooked import - so it should land one concern-group at a time, each its own commit, not as one
large mechanical pass. `scripts/affected-scope.mjs` and `scripts/change-scope.mjs` (the CI oracle
itself) are deliberately **not** given a project in either tier - they should keep forcing `everything`
via the existing unowned-file rule, on the same "do not trust a narrowed run to validate the thing
that decided to narrow" reasoning `CORE_PROJECTS` already applies to `editor`.

## Measured ceiling

Checked against the 55 real runs QUAL-08 already pulled: only 5 of the 14 `scripts/`-caused
`everything` runs in that window had no root config file (`vitest.config.js`, `playwright.config.js`,
`.github/workflows/ci.yml`, ...) touched in the same push - the other 9 would still run everything
regardless of scripts/ ownership, because a shared-global config touch alone forces it. So the
realistic gain across all of scripts/ (Tier 1 + Tier 2 together) is real but modest: roughly 9
percentage points, from 42% to about 51% of runs narrowing or skipping outright, in this window. Worth
doing for its own sake (an editor-only or Sign-only commit should not need to explain why touching a
font-coverage script ran the whole suite), not a large wall-clock rescue on its own.

## Acceptance

- Tier 1's three `project.json` files exist, `nx show projects --affected` narrows correctly for a
  sample file in each, and `npm run check:fast` is green.
- A follow-up ticket exists for Tier 2's file moves before this one closes, so the remaining work is
  not left half-done under this ticket's status.
