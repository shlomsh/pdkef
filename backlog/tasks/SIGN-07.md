---
id: "SIGN-07"
title: "Make the offline requirement testable"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-09-02"
---

# SIGN-07 · Make the offline requirement testable

## Scope and acceptance

**Make the offline requirement testable.** Service worker, precache generator, fonts/PDF worker loaders: define asset provisioning and offline-ready status for every advertised workflow/language; version caches by asset content, including unchanged font URLs. Chrome tests must disconnect the network and open/edit/export using provisioned assets, then test upgrades without losing drafts. Current Arimo-only font precache is not full language support.

## What shipped, and what writing the Chrome tests actually found

Writing the required "disconnect the network" tests surfaced two real, previously-invisible bugs that no amount of reading the code would have caught - both are now fixed, and the tests that found them stay in the suite as the regression guard.

1. **`CACHE_VERSION` had collapsed to a constant.** The 2026-08-29 precache reduction (`c1d7f13`) left the manifest listing only `/`, so `buildId` - hashed from the manifest's JSON text - hashed the same unchanging string on every build. Every deploy produced the identical cache name, so `activate()`'s "delete every cache but the current one" cleanup deleted nothing, and a same-URL asset whose *content* changed (a font fix, an icon swap) could never be invalidated for a repeat visitor - the literal "version caches by asset content, including unchanged font URLs" requirement, unmet. Fixed by hashing every `dist/` file's actual path+bytes (`scripts/buildId.mjs`, wired into `scripts/generate-precache-manifest.mjs`), verified by manually mutating a bundled font's bytes and confirming `CACHE_VERSION` changes and reverts with it. `src/lib/buildId.test.js` pins the pure hash function, including the specific "same path, different content" case fonts are.
2. **A Chromium `Cache.match()` bug ate every tool's own JS offline.** Even after precaching an island's hydration bundle and *verifying* it present via `cache.keys()`, `cache.match(event.request)` still reported a miss for it alone - every other request on the same page (images, etc.) matched fine. The common factor across every failing request: `request.destination === 'script'`, which is what a `client:load` island's own dynamic `import()` sets. Matching by `request.url` (a plain string) instead of the live `Request` object sidesteps whatever internal state Chromium attaches to it. Without this fix, no amount of precaching would have mattered - every tool would 404 its own script offline regardless of cache coverage. This is exactly the class of bug the ticket's "Chrome tests must disconnect the network" requirement exists to catch, and it was invisible to every other guard in the repo (unit tests run in jsdom, which has no Cache Storage or module loader semantics to reproduce it).
3. **Precache scope restored to the whole app (minus most fonts).** The 2026-08-29 reduction also dropped every page's HTML and JS down to precaching only `/`, on top of the (separately correct) font exclusion. A service worker can never intercept the navigation that first registers it, so a page shell alone can't fix "reopen a tool offline after exactly one visit" - its island's JS needs to be there too, and per-page dependency graphs aren't information `precacheFilter.mjs` has. `shouldPrecache` now precaches everything in `dist/` except the font catalogue (matching the pre-2026-08-29, previously-measured-safe policy: ~6 MB non-font at current site size, vs. 37 MB of fonts), plus keeps `Arimo-Regular.ttf` precached as `DEFAULT_FAMILY` so a first-ever offline Sign session still has a font to embed.
4. **Chrome e2e coverage**, `e2e/offline/offline-workflows.spec.js`: three tests, each warming the runtime cache with a real online pass before `context.setOffline(true)`. Merge (open/edit/export with fresh files, fully offline, on a page reload). Sign (draft restore from IndexedDB with no file picker, edited text intact, real `download` event fires on export, all offline). Sign draft survival across a simulated upgrade (`caches.keys()` + `caches.delete()` on every `pdkef-*` cache, replicating what `activate()` does on a real deploy, then a reload proves the IndexedDB-backed draft - a separate store from Cache Storage - was never at risk).

**Not done, called out rather than silently dropped:** per-language font provisioning stays first-use-cached, not precached (fonts are the one deliberate exclusion above, and remain the largest asset class by far). The e2e coverage exercises the default English/Arimo path plus the generic tool-page path (Merge); it does not drive a non-default-font Sign session through an offline export. That is real remaining scope if "every advertised workflow/language" is read to include the non-Latin font catalogue's own offline export path, not just app/page availability - worth a follow-up ticket rather than silently marking this closed on that dimension.

## Files touched

`public/sw.js`, `scripts/precacheFilter.mjs`, `scripts/generate-precache-manifest.mjs`, `scripts/buildId.mjs` (new), `src/lib/buildId.test.js` (new), `src/lib/serviceWorker.test.js`, `e2e/offline/offline-workflows.spec.js` (new). Also fixed three e2e specs (`e2e/sign/hebrew-font-parity.spec.js`, `e2e/sign/hebrew-composition-guard.spec.js`, `e2e/sign/thai-font-parity.spec.js`) whose imports had gone stale after the unrelated editor-architecture file relocations, which had been silently blocking the entire `npm run test:e2e` suite (a collection-time failure in any one spec file aborts the whole run) - found while trying to verify this change against the full suite.

**Verification:** `npm test` (1860/1860), full `npm run test:e2e` (93 passed, 2 pre-existing intentional skips), `npm run test:csp`, `npm run test:seo`, `npm run test:css`, `npm run test:weight`, `npm run test:gesture-golden-rule`, `npm run test:fonts` all green against a real `npm run build && npm run preview`.
