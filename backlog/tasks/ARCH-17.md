---
id: "ARCH-17"
title: "One folder per tool: Compress, Split, Edit pages, PDF to image, Image to PDF, Unlock/Protect and Redact into src/tools/"
status: "open"
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
