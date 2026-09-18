---
id: "ARCH-22"
title: "App source lives under src/; scripts/ depends on src/, never the other way around"
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

## The rule (Shlomi, 2026-09-18)

**App source lives in its component under `src/`. `scripts/` may depend on `src/`, never the other
way around.** A script is not a component, not a class, not a function: it is dev-only real estate.
Anything in `scripts/` that turns out to be product runtime (a source of truth the shipped code is
generated from, or logic the shipped code duplicates) is misplaced and moves into the component that
owns it. What is left in `scripts/` is misc tooling that depends on `src/` and invokes nothing but
its own test when touched.

### Reverse dependencies today (all the same shape: `src/` generated from `scripts/` data)

- **Fonts.** `scripts/font-manifest.mjs`, `display-only-fonts.mjs`, `font-languages.mjs`,
  `language-acceptance.mjs` are the source of truth; `generate-font-manifest.mjs` writes
  `src/editor/text/fontManifest.js` and `src/styles/editorFonts.css`, `generate-font-coverage.mjs`
  writes `src/editor/text/fontCoverageTable.js`. The data moves into `src/editor/text/` (the font
  component, `fonts.js` is already its mandated entry point); the generators import it from there.
  The coverage table stays generated (it is derived from the TTF binaries), but from a manifest that
  lives in `src/`. Nine-step font invariant [fonts-and-text] applies; screen/export parity must not
  move.
- **Service-worker precache.** `shouldPrecache()` lives in `scripts/precacheFilter.mjs` and is
  hand-copied inside `public/sw.js`, with `precacheFilter.test.mjs` existing only to catch drift
  between the two copies. One policy module under `src/` (site-lib, it is build-only), which
  `generate-precache-manifest.mjs` imports and injects into `sw.js` at build time the same way it
  already substitutes `__BUILD_ID__`. The parity test then goes away. [csp-scripts-pwa] invariants
  (no `skipWaiting()`, best-effort precache except `/`, self-uninstall on a 404 manifest) unchanged.
- **License allowlist.** The permissive-license allowlist is policy inside
  `scripts/runtime-license-inventory.mjs`; `src/data/runtimeLicenseInventory.js` is generated from it.
  The allowlist moves to `src/data/`; the script imports it.
- **A direct import.** `src/test/editorDependencyDirectionsExceptions.test.js` imports
  `staleExceptions()` from `scripts/check-editor-dependency-directions.mjs`. The test moves next to
  the script as `scripts/check-editor-dependency-directions.test.mjs` (vitest already collects
  `scripts/**/*.test.mjs`).
- `scripts/sync-pdfjs-wasm.mjs` and `src/lib/pdfjsWasm.js` both know the `public/pdfjs-dist-wasm/`
  path. The constant lives in `src/lib/pdfjsWasm.js`; the script imports it.

The full list is established by the check below running red first, plus an audit of every
`writeFileSync` target under `src/` from a `scripts/` generator (the import check cannot see a
generated-from edge).

### Enforcement

Rule 8 in `scripts/check-module-boundaries.mjs` and `docs/module-boundaries.md`: **nothing under
`src/`, `public/` or `e2e/` may import from `scripts/`.** Zero allowlist, like rule 6. It lands red,
listing today's violations, and goes green as each move above lands.

### Done so far (Tier 1, 2026-09-18)

`scripts/spike/mobi-10/`, `scripts/fixtures/editor-dependency-directions/` and `scripts/fonts/` each
got a narrow `project.json` (`scope:tooling`, no target). Verified with `affected-scope.mjs
--base HEAD~3 --head HEAD`: `everything: false`, `fonts: false`, unit run narrowed to `src/test/`.
These three are dev-only and stay that way; the rest of the flat `scripts/` files get the same
labelling only after the runtime pieces above have left.

`scripts/migrate-todo-to-backlog.mjs` (one-off from ARCH-12, referenced by nothing) is deleted.

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

- Rule 8 exists in `check-module-boundaries.mjs` and `docs/module-boundaries.md` and is green with an
  empty allowlist.
- The font data, precache policy and license allowlist live under `src/` in their component; the
  generators in `scripts/` import them. `fontCoverageReport.test.js`, the font guards and
  `test:csp` stay green; `precacheFilter.test.mjs`'s parity half is gone because there is one copy.
- Every remaining `scripts/` file is owned by a `scope:tooling` project (or is the CI oracle, which
  stays deliberately unowned), and `affected-scope.mjs` narrows for a change to any of them.
