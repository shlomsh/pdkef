---
paths:
  - "src/test/**"
  - "vitest.config.js"
  - "playwright.config.js"
  - "scripts/affected-scope.mjs"
  - "scripts/change-scope.mjs"
  - "docs/nx-affected-ci.md"
---

Loaded when working on shared test infrastructure: `src/test/`, the Vitest and Playwright configs, or
the affected-scope scripts that narrow CI to what a change actually touches. Each tool's own unit and
`e2e/` tests live under `src/tools/<tool>/` and load that tool's own rule instead; this file is about
the environments and scope those tests run in, not their content.

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
folder is growing, never a target to hit. `e2e/` itself now holds only the cross-tool specs and the font screening
guards under `e2e/sign/`. A spec under `src/tools/<tool>/e2e/` may only visit that tool's own page;
one that also visits another tool's page belongs under `e2e/` instead, enforced statically by rule 7
in `docs/module-boundaries.md` (`npm run test:module-boundaries`). `export-render-guard.spec.js` runs the real `signPdf` in-browser and rasterises the
PDF with pdf.js against per-case baselines: one rasteriser only (poppler vs Chromium noise measured at
80-88%), and never "is there ink" as a pass condition, since `.notdef` often draws more ink than the
glyph it replaced.

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
- The `fonts` Nx project (font assets, `editor`, `lib`, `tool-sign`) running the 27 font screening
  guards is decided by whether `fonts` itself is affected, not by a hand-written file list.
- Any changed file no Nx project owns (`scripts/`, root config, `package*.json`, and the like) widens
  to everything, fail-open: ambiguous scope always widens, never narrows.
