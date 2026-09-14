---
id: "DEBT-05"
title: "Tests for scripts/ leave src/lib/, and site-only helpers get a home that is not the shared lib"
status: "done"
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

## Landed (2026-09-14)

- **Script tests**: `affectedScope`, `backlog`, `buildId`, `changeScope`, `localizedSeoChecks`,
  `seoRefresh`, `serviceWorker` moved from `src/lib/` to `scripts/`, renamed to match their subject
  (`affected-scope.test.mjs`, `backlog-data.test.mjs`, `buildId.test.mjs`, `change-scope.test.mjs`,
  `localizedSeoChecks.test.mjs`, `seoRefreshLib.test.mjs`, `precacheFilter.test.mjs`).
  `vitest.config.js`'s node project include gained `scripts/**/*.test.mjs`.
- **Font coverage**: `fontCoverage.test.js`, `fontAttribution.test.js`, `fontCoverageReport.js` (with
  `fontCoverageReport.test.js` and `languageCoverage.test.js`) and `liveFontCoverage.js` (with its
  test) moved to `src/editor/text/` - the editor's own text layer, not the shared lib.
  `signLanguagePage.test.js` moved to `src/test/` (it checks the Sign page's content against the
  report, a site test). `fonts-and-text.md`'s now-empty `src/lib/*ont*` and
  `src/lib/languageCoverage*` globs were dropped; `src/editor/text/**` already covers the new homes.
- **Site-only/build-only**: `contentMarkup.ts`, `markdownRender.js`, `gitLastModified.js`,
  `cspHash.js`, `localeOfflinePacks.js` and `acceptNegotiation.js` moved to the new `src/site-lib/`,
  classified `site` in `check-module-boundaries.mjs`'s `MODULE_PREFIXES`. `maintenanceTelemetry.ts`
  stayed in `src/lib/` (tools and shell import it). `content-and-copy.md` and `routing-and-pages.md`
  globs updated; `docs/module-boundaries.md`'s old table is now a paragraph pointing at the folder.
- **`draftStoreServiceWorkerSync.test.js`** joined its subject (`draftStore.js`) in `src/lib/drafts/`;
  `vitest.config.js`'s DOM_TESTS entry for that folder became a named list
  (`{draftPolicy,draftStore}.test.js`) so this text-only, node:fs-based test does not pay for jsdom.
- `npm test` stayed at 2858 tests / 148 files, matched against a clean checkout of the branch's base
  commit (`1ca6ecc`), not just before/after in the same tree. `check:guidance`,
  `test:module-boundaries`, `test:editor-dependency-directions`, `check:fast`, `build`, `test:csp` and
  `test:seo` all green.
