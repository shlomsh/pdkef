---
paths:
  - "src/test/**"
  - "vitest.config.js"
  - "playwright.config.js"
  - "scripts/affected-scope.mjs"
  - "scripts/change-scope.mjs"
  - "scripts/check-fast.mjs"
  - "scripts/*.test.mjs"
  - "docs/nx-affected-ci.md"
  - "e2e/**"
  - "src/tools/*/e2e/**"
---

Loaded when working on shared test infrastructure (`src/test/`, the Vitest and Playwright configs, the
affected-scope scripts that narrow CI to what a change actually touches) and on any Playwright spec.
Each tool's own tests live under `src/tools/<tool>/` and load that tool's own rule too; this file is
about the environments and scope those tests run in, and what a browser assertion can rely on across
platforms, not their content.

## Test environments and E2E scope

Unit tests run under `node` (no jsdom) unless they match `DOM_TESTS` in `vitest.config.js`: any
`.test.tsx`/`.jsx` file anywhere (every tool under `src/tools/` included), what is left of the flat
`src/components/` (HeroDemo), `src/lib/use*` hook tests, `src/editor/workspace`, `src/lib/gestures`
(the gesture controller, moved out of `src/editor/` under DEBT-04 part 2 since `CompareSlider`, shell,
needed it too), and a short named list of `.test.js` files that decode images or drive pdf.js
(compress/compressImage/thumbnails/toImage in both their `src/lib/` and `src/tools/<tool>/` locations,
`src/tools/sign/useWorkspaceGestures.test.js`, `src/editor/adapters/pdf/redact.test.js`). Booting
jsdom cost more than the tests it hosted, so a pure-logic test in `src/lib`, `src/tools/<tool>/` or
`src/editor` pays nothing for a DOM it never touches; one that does need it goes in that list or
starts with `// @vitest-environment jsdom`.

Playwright is for what jsdom cannot prove; keep roughly one e2e per ten unit tests under
`src/tools/<tool>/e2e/`. A spec earns its place only by asserting something jsdom genuinely cannot -
a real tab close/reopen surviving through real browser storage, real layout or line-wrapping, a real
Fullscreen API element, drag-time pointer behaviour, a hydration/CSP flow - not by re-proving what a
unit test already proves under jsdom (DEBT-13); the 1:10 figure is a smell to notice when a tool's e2e
folder is growing, never a target to hit. `e2e/` itself now holds only the cross-tool specs, the font
screening guards under `e2e/sign/`, and the two export-pipeline guards under `e2e/export/` (ARCH-23).
A spec under `src/tools/<tool>/e2e/` may only visit that tool's own page; one that also visits another
tool's page belongs under `e2e/` instead, enforced statically by rule 7 in `docs/module-boundaries.md`
(`npm run test:module-boundaries`). `export-render-guard.spec.js` (`e2e/export/`) runs the real
`signPdf` in-browser and rasterises the PDF with pdf.js against per-case baselines: one rasteriser only
(poppler vs Chromium noise measured at 80-88%), and never "is there ink" as a pass condition, since
`.notdef` often draws more ink than the glyph it replaced.

## Rendered text width is per-platform: assert layout properties, not pixels

UI labels use `--font-sans`, the system font stack, so the same label draws at a different width on
macOS (SF), CI's Linux (a fallback face), Windows (Segoe UI) and Android (Roboto). A pixel threshold
measured on a Mac says nothing about CI: on 2026-09-24 a clearance floor in
`src/tools/merge/e2e/merge-share.spec.js` turned `main` red three times in a row (6px, then 4px;
runs 36051842433 and 36053109356), because Merge's "Compress" had 7.4px of clearance at 320px on macOS
and 3.09px on CI. One of those runs also under-reported the problem: the assertion looped over the
buttons and stopped at the first failure, so the worst button's number never printed.

- Assert what holds for any font: a label stays inside its border (`> 0`), spare width is shared
  evenly (equal clearance within 1px), controls sit on one line. The Merge spec's
  `expectEveryLabelInsideItsBorder` / `expectSpareWidthSharedEvenly` are the model. Measure a label's
  extent with a `Range` against the border box on both sides; `scrollWidth` only reports the
  inline-end half of a centred label's overflow.
- Proxy Linux locally by forcing Arial, DejaVu Sans and Verdana on the element through
  `element.style.setProperty(..., 'important')` (the CSP blocks `page.addStyleTag`). Verdana at 320px
  came closest to CI's numbers. Docker is not installed on the dev machine.
- A spec whose number came only from macOS gets a Linux run before it reaches `main`: push its branch
  and `gh workflow run ci.yml --ref <branch>` (`ci.yml` runs automatically only on `main` and PRs).

## `src/test/cross-tool/`

A test file may not launder a cross-tool import that a real edge in the same location would be
forbidden from making (rule 6 of `docs/module-boundaries.md`, DEBT-02): a test under `shell`,
`editor-ui`, `editor` or `lib`, or under one tool's own `src/tools/<name>/` folder, may not import
another tool's files. `src/test/cross-tool/` is the exemption: a test placed there classifies as
test-support, neither a core module nor a tool, so rule 6 never reaches it, and nothing imports from
it, so it can depend on tools without any project depending on it back. It holds tests that
deliberately span modules, such as `draftCheckingPlaceholder.test.tsx`/`draftRestoreRace.test.tsx`
(rendering `PdfSignTool` and `PdfRedactTool` together to test the shared draft-restore path) and
`textCoverage.test.js`/`languageAcceptance.test.js`. Rule 7 (also `docs/module-boundaries.md`) is the
companion rule for e2e specs: a `*.spec.js` under a tool's own `e2e/` folder may only reference that
tool's own routes, plus `/`; a spec that genuinely needs another tool's page lives under the top-level
`e2e/` instead. Read both rules' exact wording in `docs/module-boundaries.md` before adding a test that
touches more than one tool.

## Unit-by-impact selection (`scripts/unit-scope.mjs`, ARCH-28)

Unit tests are selected by Vitest's own module graph, not by which Nx project a changed file's folder
belongs to: `resolveUnitScope()` feeds the changed files to `vitest related <files> --run
--passWithNoTests`, so a change picks up exactly the test files that actually import it (or import
something that imports it), transitively. `WIDEN_RULES` is the one pure, exported, unit-tested table
for what that import graph cannot see - a file a test reads with `node:fs`/`readdirSync` instead of
`import` (PDF fixtures, font binaries, a handful of one-off text reads), a test that walks the whole
repository at run time (`pdfRender.test.js`, `noCamelCaseSvgAttrs.test.js`, the import-scan guard,
`backlog-data.test.mjs`), or global config that changes what "related" even means
(`vitest.config.js`, `astro.config.mjs`, `tsconfig*.json`, `package*.json`) - each row backed by the
ARCH-28 blind-spot inventory. A matching row either adds specific test files to the seed list (passing
a test file's own path as a `related` seed selects exactly that file - Vitest seeds its "affected" set
with the `related` list itself before walking import edges) or widens the whole push to the full suite.
Also fail-open, same direction as every rule below: no usable base, an empty changed-file list, an
unpaired deletion (`vitest related` on a path that no longer exists silently selects zero tests, and a
git-grep-based fallback was rejected as too unreliable to trust - see the file's own comment), or a
`vitest related` process that could not even be spawned all widen to the whole suite. A **core-folder**
change (`src/lib/`, `src/editor/`, `src/shell/`, `src/pages/`) no longer forces the whole suite for
units - only `WIDEN_RULES` or the fail-open cases above do; Nx's `CORE_PROJECTS` rule (below) still
forces `everything` for e2e/font/export scope, which is unrelated and unaffected by this. One code
path, three callers - CI's `checks` job (`affected-scope.mjs --run unit`, which now delegates here),
`check:push` (`runUnitByImpact` on its own once-resolved `resolveUnitScope()`), and `check:fast`
(`scripts/check-fast.mjs` calls `selectUnitTests()` on its own diff) - so none of them can select a
different test set for the same diff.

Renames are a special case: `changedFilesWithStatus()` (in `change-scope.mjs`, used only by
`unit-scope.mjs`) leaves git's rename detection on (`-M`), unlike `changedFiles()`'s own deliberate
`--no-renames` (kept there for Nx *ownership*, DEBT-03 - a rename must affect both its source and
destination folder). A real move reports only its destination (status `A`) since the same import edges
still exist there; only a genuine, unpaired deletion keeps status `D` and triggers the whole-suite
widen.

## The iteration loop (`check:fast`, ARCH-30)

`npm run check:fast -- --since <ref>` tests what changed since `<ref>` (working tree plus untracked),
not the whole branch: the lead passes each subagent the commit its task started from. Without
`--since` the base is the merge-base with `origin/main`; a ref that does not resolve or is not an
ancestor of HEAD fails open to the whole suite and `astro check`. Its typecheck is `tsc --noEmit` with an
incremental cache in `node_modules/.cache/` (5s cold, 2s warm), and `astro check` (18-21s whatever
changed) only when the diff touches an `.astro` file, a tsconfig, `astro.config.mjs`, the package
manifest, `src/content.config.ts` or `check-fast.mjs` itself (`chooseTypecheck()`). It ends with one
`check:fast PASS|FAIL ...` line with per-step seconds; read that instead of re-running or piping the
output through `tail`. check:push and CI keep `astro check` and the whole-branch base. Measured on
2026-09-26 (ARCH-30): the unit step has a floor near 9s for any Sign edit because
`PdfSignTool.test.tsx` alone takes 6s, and 3 parallel runs nearly double it, so one check per task
beats several.

## Nx-decided scope (`scripts/affected-scope.mjs`, `docs/nx-affected-ci.md`) - e2e, fonts, export guards

`scripts/affected-scope.mjs`'s own `deriveScope()`/`unit_paths` computation below is unchanged and
still backs `e2e_paths` narrowing (a tool project's own root) - it is simply no longer read to decide
which unit test files run; see the section above for that.

- The Nx project graph is the oracle: `affected-scope.mjs` asks `nx show projects --affected` for the
  changed files, then CI runs one narrowed `playwright test` per shard (and, historically, the now-
  retired `vitest run <unit_paths>` line - see above for what replaced it).
- `CORE_PROJECTS` (`site`, `shell`, `editor`, `lib`) widen e2e/font/export scope to everything: every
  tool depends on all four, so a change to any of them can affect every tool's behavior and nothing
  narrows anyway.
- An affected `tool-<name>` project narrows e2e paths to that tool's own `src/tools/<name>/e2e/`.
- The 25 font screening guards (`fonts` Playwright project, `e2e/sign/`) run per-push only when a
  font-registry file, a guard spec/fixture, or the toolchain around them changed - a hand-written
  file-glob rule in `affected-scope.mjs` (`matchesFontsGlob`, ARCH-23), not whether Nx's `fonts`
  project is affected: that project's own `editor`/`lib`/`tool-sign` dependency edges produced only
  false positives (a Sign toolbar or tooltip change ran all 27, formerly, for zero coverage benefit -
  see `backlog/tasks/ARCH-23.md`). The two export-pipeline guards (the real `signPdf`, rasterised
  against a baseline, and language acceptance) moved to their own `export-guards` project
  (`e2e/export/`) in the same change: they keep a coarse whole-project Nx dependency on
  `editor`/`lib`/`tool-sign`, which is correct for them (only two cheap specs, and they exercise the
  export pipeline for real) and decided the normal way, by whether `export-guards` is affected.
- Any changed file no Nx project owns (`scripts/`, root config, `package*.json`, and the like) widens
  to everything, fail-open: ambiguous scope always widens, never narrows.

## `npm run check:push` (`scripts/check-push.mjs`, ARCH-29)

The local pre-push command: computes the same scope as CI, once, then runs only the steps that scope
needs, stopping at the first failure. It never re-derives the scope itself - it calls
`affected-scope.mjs`'s own exported `resolveScope`/`runE2eProduct`/`runE2ePerf`/`runFonts`/
`runExportGuards` and `unit-scope.mjs`'s `resolveUnitScope`/`runUnitByImpact` against one base (the
merge-base of `origin/main` and `HEAD`) and one file list (the working tree against that base,
uncommitted and untracked files included, so it works before a commit too). The one question it adds
that the oracle doesn't answer is whether the diff reaches `dist/` at
all - `fileCannotReachDist()`'s allowlist (docs/backlog, `.github/`, `*.test.*`, `src/test/`, `e2e/`
specs, and `scripts/` other than the handful `npm run build` itself invokes) gates the build and its
dist guards; anything not on that allowlist defaults to "reaches dist," same fail-open direction as
every rule above. A diff that only needs Playwright still triggers a build even when it doesn't reach
`dist/` on its own - Playwright cannot run against a stale one. A docs-only diff runs only `check:backlog` and
`check:guidance`, as CI does; no resolvable base or an empty diff fails open (build and every dist
guard).

ARCH-31 (measured 2026-09-26: a `merge.test.js`-only push ran 67s of Playwright, and 50 of the last
79 pushes ran every spec) narrows three things. A diff of only `*.test.*`/`*.spec.js` files (plus
docs) runs no Playwright for a unit test and only the changed specs otherwise, with the font and
export guards only when one of their own specs changed (`narrowTestOnlyChange()`); a spec helper or
fixture keeps the Nx verdict. The typecheck is check:fast's `chooseTypecheck()`: tsc unless the diff
touches an `.astro` file or a type config; CI always runs `astro check`. Port 4173 is machine-wide
and Playwright reuses whatever holds it locally, so check:push refuses to start when another
worktree's process (or one whose directory it cannot read) holds it. ARCH-32 is the next step:
e2e by file-level reachability for core changes.
