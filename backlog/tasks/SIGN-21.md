---
id: "SIGN-21"
title: "Make the browser guard helpers reachable from the preview server"
status: "open"
priority: "P1"
epic: "sign-tool-architecture"
phase: "release-blocker"
depends_on: []
legacy_state: "Reopened 2026-09-02 — language-acceptance bundle still 404s"
---

# SIGN-21 · Make the browser guard helpers reachable from the preview server

## Scope and acceptance

**Make the browser guard helpers reachable from the preview server.** A clean `npm run test:e2e` builds successfully, then every shaping/advance guard that creates a temporary fontkit bundle fails before its assertion: `page.addScriptTag()` gets 404 for files such as `/__e2e-arabic-fontkit-bundle.js` and `/__e2e-cjk-fontkit-bundle.js`. `buildFontkitBundle()` writes those files to `dist/` in each test's `beforeAll`, after `astro preview` has already started; the preview server does not serve them. Change the test serving/build order or use a server that can deliberately serve these generated test-only assets. Keep unique bundle names and cleanup, and prove a fresh local checkout plus CI run the full suite rather than bypassing these guards.

**Resolved.** Root cause: `npm run preview` is Vite's preview server, which serves `dist/` through `sirv` in its non-dev mode - `sirv` snapshots the directory's file list exactly once at server startup (`totalist`) and answers every request from that snapshot, never checking the filesystem live. The guard bundles are written in each test file's `beforeAll`, which necessarily runs after `playwright.config.js`'s `webServer` has already started the preview server, so the file is genuinely on disk but invisible to the snapshot.

Fix: kept the write-to-`dist`/cleanup mechanism exactly as it was (unique per-guard filenames, `buildFontkitBundle`/`removeFontkitBundle`, `buildSignBundle`/`removeSignBundle`, `beforeAll`/`afterAll`) and added one `page.route('**/<bundleFilename>', (route) => route.fulfill({ path: bundlePath }))` before each `page.goto`/`page.addScriptTag` call, in the three places that build these test-only bundles: `e2e/sign/fixtures/shapingGuardHarness.js` (`createShapingGuardTest`, used by every per-script shaping guard), `e2e/sign/cjk-advance-parity-guard.spec.js`, and `e2e/sign/export-render-guard.spec.js` (via `e2e/sign/fixtures/exportRenderHarness.js`). This answers the browser's request straight from the file already on disk, bypassing the server's stale snapshot, without touching the build/preview order, `astro.config.mjs`, or `vercel.json`, and without weakening the CSP posture (`page.route` still answers a same-origin URL, so `script-src 'self'` is satisfied exactly as before).

Found and fixed along the way, required to even get `npm run test:e2e` to collect tests: three e2e spec files (`hebrew-composition-guard.spec.js`, `hebrew-font-parity.spec.js`, `thai-font-parity.spec.js`) and `scripts/generate-font-coverage-report.mjs` still imported `src/lib/fonts.js` / `src/lib/bidiRuns.js` / `src/lib/hebrewCombiningCorpus.js`, which the prior "editor architecture relocations" work moved to `src/editor/text/`. Updated the four import paths; unrelated to the bundle-reachability bug itself but a hard blocker for proving this ticket's fix against the real suite.

Verified: a full `npm run build && npm run preview` cycle is no longer needed to catch this class of bug since it's e2e-only, but `npm run test:e2e` was run to completion locally (92 tests: 90 passed, 2 skipped - the pre-existing documented Caveat `test.skip` and the export-render guard's Linux-only baseline skip on this macOS machine; 0 failed), including every previously-404ing guard (Arabic, Pashto, Bengali, Devanagari x2, Gurmukhi, Telugu, Tamil, Malayalam, every Latin candidate, and all eight CJK family/weight combinations in `cjk-advance-parity-guard.spec.js`). `npm test` (1856 tests) and `npm run test:csp` were unaffected, as expected since only e2e test-support files changed.

**Reopened 2026-09-02 against `501071b`.** The fix covered the three bundle consumers
named above but not `e2e/sign/language-acceptance.spec.js`, which also calls
`buildSignBundle()` after the preview server starts and then loads
`/__e2e-language-acceptance-bundle.js` without a `page.route`. A clean full run now ends
**93 passed, 2 skipped, 1 failed** at that 404, before any of its 117 accepted
language/face combinations are exercised. Add the missing route and centralize the
"build a temporary bundle + make it reachable + clean it up" fixture so a future bundle
consumer cannot omit one step. Acceptance remains a clean full `npm run test:e2e`, not a
focused pass of the already-routed guards.
