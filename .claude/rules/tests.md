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

## Fixes are test-first

A bug or a review finding starts as a failing test: reproduce it, run it and read the failure (it must
fail for the stated reason), then change the code until it passes. A subagent's brief for a fix orders
it the same way (test, red run, fix, green run) and asks for the red output in its report. Mutating the
fix to watch the test go red is a backstop, not the method. RED-53's reviews found tests that could not
fail (storage seeded before mount, a default compared with itself, a zoom fixed at 1), all written after
the fix.

Test seams (ARCH-61): an export that only tests import carries a `/** @testSeam */` JSDoc tag; untagged, `scripts/check-unused-exports.mjs` counts it as test-only against the ratchet.

## Test environments and E2E scope

Unit tests run under `node` (no jsdom) unless they match `DOM_TESTS` in `vitest.config.js`: any
`.test.tsx`/`.jsx` file anywhere (every tool under `src/tools/` included), what is left of the flat
`src/components/` (HeroDemo), `src/lib/{handoff,hooks,output}/use*` hook tests, `src/editor/workspace`, `src/lib/gestures`
(the gesture controller, moved out of `src/editor/` under DEBT-04 part 2 since `CompareSlider`, shell,
needed it too), and a short named list of `.test.js` files that decode images or drive pdf.js
(compress/compressImage/thumbnails/toImage in both their `src/lib/` and `src/tools/<tool>/` locations,
`src/tools/sign/hooks/useWorkspaceGestures.test.js`, `src/tools/redact/lib/redact.test.js`). Booting
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

## `src/test/support/`

The helpers other projects' tests import (`setup.js`, `astroContentStub.js`, `mockFileShare.js`,
`setInputFiles.js`, `pdfPageTreeFixtures.ts`, `until.js`, `fixtures/`) live in `src/test/support/`, the
Nx project `test-support`, which imports no src project. A helper that needs `lib`, `editor` or any
other project does not belong there. The repo-wide guards stay directly under `src/test/` (`site-test`).
That split keeps `lib -> site-test -> editor -> lib` from closing a loop.

Island tests mock only the storage and network edge, through `src/test/harness/toolHarness.ts`
(ARCH-78): fresh fake IndexedDB and storage per test, recorded beacons, created blobs, and the stored
draft read back through the real `draftStore`. It imports `lib`, so it lives in `site-test`, not
`test-support`. The pdf.js edge (the encryption probe, the thumbnail source, `pdfjs-dist` for Redact) is faked
once in `src/test/harness/pdfjsEdges.ts` and registered by the setup files in `src/test/harness/setup/`, which
only the `island*` projects of `vitest.config.js` load (a test elsewhere sees the real modules, guarded by
`islandSetup.test.ts`); a test steers it through `harness.pdfjs` (`probeAs`, `holdNextProbe`, `source`,
`pageCountOfNextRead`). Compress's three engines (canvas and codecs) are registered the same way. An island
file keeps a `vi.mock` only for a different fake, with a comment saying why. A new island test file goes into
the `ISLAND_*` globs of `vitest.config.js`.

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
Locally this never widens (QUAL-24): where CI's rules would run everything - an oracle file, a `WIDEN_RULES`
whole-suite row, an unpaired deletion (`vitest related` on a path that no longer exists silently selects
zero tests, and a git-grep fallback was rejected as unreliable), or no base - the local run prints "CI runs
the full suite" and keeps only the tests `vitest related` reaches; an empty diff runs no unit tests, and an
unusable `--since` fails instead of widening. A **core-folder** change (`src/lib/`, `src/editor/`,
`src/shell/`, `src/pages/`) does not force the whole suite for units; Nx's `CORE_PROJECTS` rule (below)
still forces `everything` for e2e, font and export scope, which is unrelated. CI's `checks` job runs the whole
unit suite, unnarrowed, on every push; `check:fast` and `check:push` select by impact on their own diff.

**What runs where.** Local = the diff (guards, reachable units, `tsc`). CI push = the full unit suite,
`typecheck` as its own job, and e2e, fonts and export guards narrowed by scope on four chromium shards (QUAL-23).
Nightly = every chromium e2e spec twice (`--repeat-each=2`) to surface flaky specs.

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
ancestor of HEAD fails with an error rather than widening. Its typecheck is always `tsc --noEmit` with an
incremental cache in `node_modules/.cache/` (5s cold, 2s warm), after `astro sync` when
`.astro/types.d.ts` is missing; `astro check` (18-21s) runs only in CI's own `typecheck` job. It ends with one
`check:fast PASS|FAIL ...` line with per-step seconds; read that instead of re-running or piping the
output through `tail`. check:push keeps the whole-branch base. Measured on
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
- `CORE_PROJECTS` (`site`, `shell`, `editor`, `lib`, and since ARCH-34 the two folders carved out of `site`:
  `data`, `site-lib`) widen e2e, font and export scope to everything unless
  import reachability (ARCH-32) can name the tools: Nx cannot (it connects `editor` to 18 of 19
  projects), so `narrowByReachability()` walks "who imports me" from every changed `src/` file
  (graph from `scripts/import-graph.mjs`, the scan `check-module-boundaries.mjs` shares) and every
  walk must end at a tool file, a tool's own page or an `e2e/` file under the always-run site-wide specs
  (tool specs also visit the home page and `/he/merge/`, so reaching any other page or spec goes wide). Then only those tools' `e2e/` run, plus the site-wide specs
  and the export guards; the summary line names the file that reaches each tool. It fails open to
  everything, with the reason, for CSS, content or any file the scan never saw, a module nothing
  live imports (`middleware.ts`, `api/`, `content.config.ts`, a file only a build script or a path
  string loads) and a diff with no `src/` file. ARCH-34: a CSS file with an importer is walked through
  that importer; `src/content/**` goes wide with its own reason (the layouts every page renders read
  the collections); `ANALYTICS.md` is docs-only; `public/.well-known/**` runs no spec (owned by
  `publicOwnerOf()` rather than an Nx `project.json`, which `public/` would publish); `public/images/**`
  stays unowned and widens (tool specs open `redaction-guide/sample.pdf`, `FileDropzone` fetches it,
  tool pages render `scan-guide/*`), as do `public/sw.js` and the other loose public files.
- The site-wide specs are split by directory into Nx projects tagged `site-e2e` (`e2e/<dir>/project.json`,
  root specs stay in `site-e2e`). A directory lists in `implicitDependencies` the `tool-<t>` projects whose
  pages its specs visit; a narrowed core verdict runs a directory only when it owns a changed or
  reached spec or declares a reached tool, and falls back to every site-wide path whenever it cannot
  tell (no tool reached, a changed file outside `src/`). `scripts/e2e-projects.test.mjs` fails when a
  spec visits a tool route its directory does not declare, so a new spec directory needs a
  `project.json` carrying the tag. Unit tests and `src/test/` support never count as
  reaching a tool. `scripts/import-graph.mjs` is an oracle file: a change to it runs everything.
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

**Two commands, split by who runs them.** `check:push` is the lead's pre-push gate and has no
Playwright: guards, unit, typecheck, build and the dist guards, with independent steps run
concurrently (guards + unit + typecheck + build in one stage, dist guards after the build; output
shown only for a failure, the first failure kills the stage). `npm run check:e2e` is the build plus
the Playwright projects the diff selects, chromium only (webkit is CI's); `-- --perf` adds the
wall-clock perf project. Subagents run neither, only `check:fast`. CI still runs the whole unit suite.

The local pre-push command: computes the same scope as CI, once, then runs only the steps that scope
needs, stopping at the first failure. It never re-derives the scope itself - it calls
`affected-scope.mjs`'s own exported `resolveScope`/`runE2eProduct`/`runE2ePerf`/`runFonts`/
`runExportGuards` and `unit-scope.mjs`'s `resolveUnitScope`/`runUnitByImpact` against one base (the
merge-base of `origin/main` and `HEAD`) and one file list (the working tree against that base,
uncommitted and untracked files included, so it works before a commit too). The one question it adds
that the oracle doesn't answer is whether the diff reaches `dist/` at
all - `fileCannotReachDist()`'s allowlist (docs, backlog, `.github/`, `*.test.*`, `src/test/`, `e2e/`
specs, and `scripts/` other than the handful `npm run build` itself invokes) gates the build and its
dist guards; anything not on that allowlist defaults to "reaches dist," same fail-open direction as
every rule above. A diff that only needs Playwright still triggers a build even when it doesn't reach
`dist/` on its own - Playwright cannot run against a stale one. QUAL-36: the scripts a dist guard runs, their relative imports, and any `scripts/*.json` (guard data) count as reaching dist. A docs-only diff runs only `check:backlog` and
`check:guidance`, as CI does; an empty diff, or no resolvable base, runs the guards and `tsc` only:
no unit tests and no build, since CI runs both in full.

ARCH-31 (measured 2026-09-26: a `merge.test.js`-only push ran 67s of Playwright, and 50 of the last
79 pushes ran every spec) narrows three things. A diff of only `*.test.*`/`*.spec.js` files (plus
docs) runs no Playwright for a unit test and only the changed specs otherwise, with the font and
export guards only when one of their own specs changed (`narrowTestOnlyChange()`, in `scripts/test-only-scope.mjs`; since QUAL-35 CI applies it too, through `resolveScope`'s `finishScope`); a spec helper or
fixture keeps the Nx verdict. The local typecheck is always `tsc`; CI's `typecheck` job runs `astro check`. Port 4173 is machine-wide
and Playwright reuses whatever holds it locally, so check:push refuses to start when another
worktree's process (or one whose directory it cannot read) holds it.

## `npm run gate:ios`: Sign fill mode in the iOS Simulator (SNG-07)

Real iOS Safari behaviour that Playwright's WebKit can't reproduce: native taps, the software keyboard,
iOS's zoom on focus. `scripts/ios-gate/` drives a booted iPhone simulator through Appium's XCUITest
driver and prints PASS / FAIL per scenario: tap a field (focus, keyboard up, no zoom out),
type, the keyboard's Next, tap outside, and pinch then Next (zoom kept). Screenshots go to
`$TMPDIR/pdkef-ios-gate/`.
- Needs Xcode, a booted iPhone simulator, the preview on 4173 (`npm run build && npm run preview`), and
  the driver once: `node scripts/ios-gate/install-driver.mjs` (it installs xcuitest into `node_modules/.cache/appium`
  and pins that cache's `shell-quote` to a patched release; the cache sits outside the lockfile, so the repo's
  override and `npm audit` do not cover it).
- Run it by hand before a release and after a Sign mobile change. It is not in `check:push` or CI.
- The pinch scenario drives Appium's `mobile: pinch` and passes or fails on the app (SNG-20): a pinch
  does not dismiss the keyboard, and Next holds the zoom. It reloads the page first, because the tap
  after "tap outside" does not focus a field (SNG-23). Toolbar and font sheet focus stay in
  Playwright's WebKit project (`fill-mode-phone-regressions.spec.js`).
- `astro preview` here binds to Astro's default port unless told: use
  `npm run preview -- --host ::1 --port 4173` (the gate reaches it over `[::1]`), and stop it after.
