---
id: "SIGN-21"
title: "Make the browser guard helpers reachable from the preview server"
status: "open"
priority: "P1"
epic: "sign-tool-architecture"
phase: "release-blocker"
depends_on: []
legacy_state: "Open — found 2026-08-29"
---

# SIGN-21 · Make the browser guard helpers reachable from the preview server

## Scope and acceptance

**Make the browser guard helpers reachable from the preview server.** A clean `npm run test:e2e` builds successfully, then every shaping/advance guard that creates a temporary fontkit bundle fails before its assertion: `page.addScriptTag()` gets 404 for files such as `/__e2e-arabic-fontkit-bundle.js` and `/__e2e-cjk-fontkit-bundle.js`. `buildFontkitBundle()` writes those files to `dist/` in each test's `beforeAll`, after `astro preview` has already started; the preview server does not serve them. Change the test serving/build order or use a server that can deliberately serve these generated test-only assets. Keep unique bundle names and cleanup, and prove a fresh local checkout plus CI run the full suite rather than bypassing these guards.
