---
id: "ARCH-17"
title: "One folder per tool: Compress, Split, Edit pages, PDF to image, Image to PDF, Unlock/Protect and Redact into src/tools/"
status: "done"
priority: "P1"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-16"]
---

# ARCH-17 · The seven tools that are not mid-flight move into src/tools/<tool>/

## Problem

Eight tool islands are flat files in `src/components/`, their logic is spread over `src/lib/` (15 of
its 46 modules have exactly one consumer), and their unit tests and e2e specs live in two other
trees. A tool is not a thing an agent can point at.

## Scope

For each of `compress` (with compress-image), `split`, `edit-pages`, `to-image`, `image-to-pdf`,
`security` and `redact`, in that order, one commit each:

- `git mv` the island (`Pdf<X>Tool.tsx` and its test), the tool's own components (Redact: `RedactBox`,
  `RedactToolbar`), the `src/lib/` modules that only it consumes (per the consumer table in
  `docs/module-boundaries.md`; a module with two tool consumers stays in `lib` until ARCH-20 decides)
  and the tool's e2e group (`e2e/<tool>/`) into `src/tools/<tool>/` with an `e2e/` subfolder.
- `playwright.config.js` gains the `src/tools/*/e2e` test directory alongside `e2e/` (cross-tool
  specs such as `tool-layout`, `tool-output-paths`, `csp-smoke`, `offline` stay in `e2e/`); the
  `perf` and `fonts` globs follow the files they match.
- `vitest.config.js`'s `DOM_TESTS` gains `src/tools/**/*.test.{tsx,jsx}`; the guard scripts and rule
  `paths:` follow.
- Redact is the first editor-based tool to move; it proves the `editor-ui` boundary from ARCH-16
  holds (Redact must import nothing from Sign).

Merge and Sign are ARCH-18: Merge has an epic in flight on its own branch and Sign is the largest.

## Acceptance

- Each commit green through the whole `ci.yml` chain; the boundary checker's allowlist shrinks with
  each and never grows.
- `src/tools/<tool>/` is self-contained: its imports go to `shell`, `editor-ui`, `editor`, `lib`,
  `i18n` and `data` only. A grep for `from '../../tools/` outside `src/tools` and `src/pages` is empty.
- The Playwright test count is unchanged (276 as of 2026-09-13) after each move.

## Notes

- Done 2026-09-13, eleven commits from `337fac6` (plumbing) to `cef13e4`, one per tool in the
  order compress, split, edit-pages, to-image, image-to-pdf, security, redact, three agents in
  parallel after the plumbing. Playwright discovers `src/tools/*/e2e/**` beside `e2e/`; the count
  stayed 276 after every move; unit 2765 to 2787 because `noCamelCaseSvgAttrs.test.js` now lives in
  `src/test/` and walks all of `src/` (it used to scan only its own folder, so moves shrank it
  silently).
- Redact proved the `editor-ui` boundary, with one correction: `Workspace.module.css`,
  `EditorElement.module.css` and `SignToolbar.module.css` were Sign-and-Redact chrome living under
  `SignTool/`; they moved to `src/editor-ui/` first (`7e9bca1`), which retired ten allowlist entries
  (25 to 15) instead of turning three into tool-to-tool edges. `src/tools/redact/` imports nothing
  from `SignTool/`.
- Things a `from` grep misses and every move had to catch by hand: `vi.mock('...')` strings,
  `import('...')` in type positions, `path.resolve(__dirname, './__fixtures__')` depths (the
  fixtures stay in `src/lib/__fixtures__/`), and a module moving into the same folder as its only
  consumer (`./x`, not `../../lib/x`).
- Left flat in `src/components/` on purpose: `PdfMergeTool`, `PdfSignTool`, `MergeTool/`,
  `SignTool/` (ARCH-18), `HeroDemo/` and the `.astro` files (site), and the three cross-tool tests
  `draftCheckingPlaceholder`, `draftRestoreRace`, `overlayElements` (see the record's "Needs a
  decision"; the first two belong next to `draftStore.js`).
