---
id: "DEBT-05"
title: "Tests for scripts/ leave src/lib/, and site-only helpers get a home that is not the shared lib"
status: "open"
priority: "P2"
epic: "architecture-debt"
phase: "near-term"
depends_on: ["DEBT-04"]
---

# DEBT-05 · `src/lib/` stops being the dumping ground for code with no project

*Filed 2026-09-14*, finding 4 of
[docs/architecture-debt-review-2026-09-14.md](../../docs/architecture-debt-review-2026-09-14.md).

## Problem

Seven of the thirty test files in `src/lib/` test `scripts/*.mjs` (`affectedScope`, `backlog`,
`buildId`, `changeScope`, `localizedSeoChecks`, `seoRefresh`, `serviceWorker`); `fontCoverage.test.js`
(240 tests) tests `src/editor/text/fonts.js`; five modules (`contentMarkup`, `markdownRender`,
`gitLastModified`, `cspHash`, `localeOfflinePacks`) are build-time site helpers and three
(`acceptNegotiation`, `fontCoverageReport`, `liveFontCoverage`) have no `src/` consumer at all. A
`lib` change means "anything", so every `lib` commit runs everything.

## Scope

- Script tests -> `scripts/<name>.test.mjs` beside their subject; add `scripts/**/*.test.mjs` to
  `vitest.config.js`'s node project include (and `NEVER` stays as is). `fontCoverage.test.js` ->
  `src/editor/text/`.
- Site/build-only modules -> `src/site-lib/` (classified `site` in `check-module-boundaries.mjs`'s
  `MODULE_PREFIXES`, one row) with their tests; `.claude/rules/content-and-copy.md` and
  `routing-and-pages.md` globs follow. `acceptNegotiation.js` and the two font-coverage report modules
  go with them or to `scripts/lib/`; pick by consumer, not by name.
- `docs/module-boundaries.md`'s "Site-only or build-only" table becomes a sentence pointing at the folder.

## Acceptance

- `ls src/lib/*.test.*` shows only tests whose subject is in `src/lib/`.
- `npm test` count unchanged (2835 at filing); `check:guidance` green (no glob matches nothing).
