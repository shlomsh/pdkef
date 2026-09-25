---
paths:
  - "src/test/**"
  - "vitest.config.js"
  - "playwright.config.js"
  - "scripts/affected-scope.mjs"
  - "scripts/change-scope.mjs"
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

## Affected-scope rules (`scripts/affected-scope.mjs`, `docs/nx-affected-ci.md`)

- The Nx project graph is the oracle: `affected-scope.mjs` asks `nx show projects --affected` for the
  changed files, then CI runs one narrowed `vitest run` and one narrowed `playwright test` per shard.
- `CORE_PROJECTS` (`site`, `shell`, `editor`, `lib`) widen to everything: every tool depends on all
  four, so a change to any of them can affect every tool's behavior and nothing narrows anyway.
- An affected `tool-<name>` project narrows unit and e2e paths to that tool's own
  `src/tools/<name>/` and `src/tools/<name>/e2e/`; `src/test/` always runs alongside a narrowed set.
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
`affected-scope.mjs`'s own exported `resolveScope`/`runUnit`/`runE2eProduct`/`runE2ePerf`/`runFonts`/
`runExportGuards` against one base (the merge-base of `origin/main` and `HEAD`) and one file list (the
working tree against that base, uncommitted and untracked files included, so it works before a commit
too). The one question it adds that the oracle doesn't answer is whether the diff reaches `dist/` at
all - `fileCannotReachDist()`'s allowlist (docs/backlog, `.github/`, `*.test.*`, `src/test/`, `e2e/`
specs, and `scripts/` other than the handful `npm run build` itself invokes) gates the build and its
dist guards; anything not on that allowlist defaults to "reaches dist," same fail-open direction as
every rule above. A diff that only needs Playwright still triggers a build even when it doesn't reach
`dist/` on its own - Playwright cannot run against a stale one. A docs-only diff runs only `check:backlog` and
`check:guidance`, as CI does; no resolvable base or an empty diff fails open (build and every dist
guard). Before Playwright it warns when something already listens on 4173, since Playwright reuses
it locally and may test an older build.
