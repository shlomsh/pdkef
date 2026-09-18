---
id: "ARCH-22"
title: "App source lives under src/; scripts/ depends on src/, never the other way around"
status: "done"
priority: "P2"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-20", "QUAL-08"]
---

# ARCH-22 · App source lives under src/; scripts/ depends on src/, never the other way around

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

### Reverse dependencies today (audited 2026-09-18, every write and import under scripts/ read)

Rule 8 (below) runs red on 14 import edges, and the audit found the generated-from edges the import
check cannot see. Grouped by the component that should own each:

- **Fonts (the big one).** `scripts/font-manifest.mjs` (38 families, `DEFAULT_FONT_FAMILY`,
  `RETIRED_FONTS`), `display-only-fonts.mjs`, `font-languages.mjs` (515 lines of per-language
  alphabets), `language-acceptance.mjs` (Sign's rollout contract) are the source of truth;
  `generate-font-manifest.mjs` writes `src/editor/text/fontManifest.js` and `src/styles/editorFonts.css`
  (with its own `FACE_CSS` weight/style policy), `generate-font-coverage.mjs` writes
  `src/editor/text/fontCoverageTable.js` **including the runtime lookup functions** (`fontFileHasGlyph`
  and friends, authored in a template literal at lines 246-310 - runtime code living in a script),
  `generate-font-coverage-report.mjs` writes `fontCoverageReport.js`. Direct imports: a shipped page
  (`src/pages/licenses.astro`), a shipped stylesheet's `@source` (`src/styles/licensesPage.css`, which
  rule 8 does not see), three editor tests, the cross-tool acceptance test, two e2e specs, and
  `scripts/precacheFilter.mjs`.
  Decision: the data is hand-written under `src/editor/text/` and nothing in `src/` is generated from
  `scripts/` any more. The runtime manifest and the per-family license side-table are two modules
  (license text must not enter the editor bundle; a unit test keeps their family keys identical); the
  lookup functions become a hand-written module and the coverage table becomes data only; alphabets and
  `DISPLAY_ONLY_FONTS` move alongside; the acceptance matrix moves to `src/tools/sign/` (it is Sign's
  contract). The generators stay in `scripts/`, import from `src/`, and still produce `editorFonts.css`,
  `fontCoverageTable.js` (data), `fontCoverageReport.js`, the `THIRD_PARTY_LICENSES.md` section and
  `docs/language-font-acceptance-matrix.md` - all generated *from* `src/`, the allowed direction. The
  nine-step font unit of work in `.claude/rules/fonts-and-text.md` is rewritten to match (step 3 was
  already stale: it never named the manifest script).
- **Redact's sample form.** `scripts/generate-practice-form.mjs` authors the entire content of the
  shipped `public/images/redaction-guide/sample.pdf` (copy, field names, palette) that
  `src/shell/FileDropzone.tsx` fetches at runtime. The content moves to `src/tools/redact/` as data;
  the generator imports it.
- **License policy.** `src/data/runtimeLicenseInventory.js` is generated from the reviewed browser
  closure (`RUNTIME_ROOT_PACKAGES`, `BUILD_ONLY_CLOSURES`, `RUNTIME_PACKAGE_NAMES`,
  `LICENSE_URL_OVERRIDES`) inside `scripts/runtime-license-inventory.mjs`; `APPROVED_RUNTIME_LICENSES`
  only gates the verify step. All of that policy moves to `src/data/runtimeLicensePolicy.js`; the
  script imports it and keeps the node_modules walk.
- **Precache.** Corrected: `shouldPrecache()` is not duplicated in `public/sw.js` (the worker consumes
  the manifest JSON). The edge is `precacheFilter.mjs` importing the font manifest, which the font
  move resolves. The "default face needs no offline pack because it is precached" policy is stated
  twice (`precacheFilter.mjs` and `src/tools/sign/fontOfflinePacks.js`); the precache policy moves to
  `src/site-lib/precachePolicy.js` and `fontOfflinePacks.js` derives from it.
- **The checkers' own tests.** `src/test/editorDependencyDirectionsExceptions.test.js`,
  `moduleBoundariesImportScan.test.js`, `moduleBoundariesRules.test.js` import the scripts they test.
  They move next to them as `scripts/*.test.mjs`.
- **pdf.js wasm path.** `scripts/sync-pdfjs-wasm.mjs` and `src/lib/pdfjsWasm.js` both spell
  `pdfjs-dist-wasm`. The directory name is exported from `src/lib/pdfjsWasm.js`; the script imports it.
- Left as is, recorded: the glyph-set policy inside `scripts/fonts/*.py` (which characters each
  CJK/demo subset ships) is product-defining but produces committed binaries by hand; not a
  generated-source edge. Revisit if a subset is ever rebuilt in CI.

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

## Result (closed 2026-09-18, branch `arch-22-scripts-ownership`, 18 commits)

- **Rule 8 exists and is green with no allowlist.** It landed red on 14 edges, one of them a shipped
  page (`src/pages/licenses.astro` importing the font manifest) and one a shipped stylesheet's
  `@source`, and went to zero as each move below landed.
- **Every runtime piece left `scripts/`**, each move proving its generated output unchanged:
  - Fonts: `src/editor/text/fontManifest.js` (hand-written now, with `FACE_CSS` and
    `isPrecachedFontFile`), `fontLicenses.js` (side-table, key sets tested identical, never in the
    editor bundle), `displayOnlyFonts.js`, `languageAlphabets.js`, `fontCoverageLookup.js` (the
    lookup code that used to be authored inside the generator's template string);
    `fontCoverageTable.js` is data only; `src/tools/sign/languageAcceptance.js` is Sign's contract.
    The four generators import from `src/`. Sign page weight moved by -96 bytes.
  - `src/site-lib/precachePolicy.js` (what the worker downloads eagerly); `fontOfflinePacks.js`
    derives "the default family needs no pack" from the manifest instead of restating it.
  - `src/data/runtimeLicensePolicy.js` (reviewed browser closure, overrides, allowlist).
  - `src/tools/redact/practiceFormContent.js` (every word and field of the shipped sample form).
  - `PDFJS_WASM_DIR` in `src/lib/pdfjsWasm.js`, imported by the postinstall sync.
  - The three checker tests moved next to their scripts as `scripts/*.test.mjs`.
- **What remains in `scripts/` is one dev-only `tooling` Nx project** (plus the three nested ones),
  depending on `editor`, `lib`, `i18n`, `site`, `tool-sign`, `tool-redact`, depended on by nothing. A
  tooling-only change now resolves to `everything=false, fonts=false, unit_paths=scripts/ src/test/`
  (proved on `13adcbe6`). The one deliberate exception: a change to `scripts/affected-scope.mjs` or
  `scripts/change-scope.mjs` (the oracle itself) still forces a full run, by a named rule with tests.
- Deleted: the ARCH-12 migration one-off, the manifest's unused per-family `precache` flag.
- Full `ci.yml` chain green locally on the final commit: 3011 unit tests, build, CSP, SEO, redirects,
  CSS, weight, 27 font guards. One webkit Merge reload spec
  (`merge-direction-a.spec.js`, "a reload from the bottom of the page") timed out once in the full
  product run and passed 18/18 re-run in isolation; the branch does not touch Merge. Recorded here,
  not fixed here.
- Still forces a full run, correctly: root config in `nx.json`'s `sharedGlobals`, `.github/`, a hand
  edit to `THIRD_PARTY_LICENSES.md` alone (deliberately not docs-only, `change-scope.mjs` explains).

