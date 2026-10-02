---
paths:
  - "astro.config.mjs"
  - "vercel.json"
  - "src/layouts/**"
  - "src/components/SeoSchema.astro"
  - "src/components/OrganizationSchema.astro"
  - "public/sw.js"
  - "public/manifest.webmanifest"
  - "scripts/verify-csp.js"
  - "scripts/generate-precache-manifest.mjs"
  - "scripts/sw.test.mjs"
  - "src/site-lib/precachePolicy*"
  - "scripts/buildId.mjs"
  - "scripts/check-dependency-advisories.mjs"
  - "scripts/verify-dependency-governance.mjs"
  - "package.json"
  - "package-lock.json"
  - "patches/**"
  - "e2e/csp-smoke.spec.js"
  - "e2e/offline/**"
  - "docs/dependency-governance.md"
---

# CSP, inline scripts, the service worker, and dependency pinning

Loaded when touching anything that changes what scripts or styles the browser is allowed to run, or
what the service worker caches. The headline is in CLAUDE.md: **CSP is invisible in `astro dev`, so any
change here is verified only by `npm run build && npm run preview`.** This file is the mechanism and
the incidents.

## Content-Security-Policy

The CSP is intentionally split across two layers:

1. **`astro.config.mjs`'s `security.csp`** (Astro 6+ built-in feature) auto-computes sha256 hashes for every inline `<script>`/`<style>` Astro emits or processes (the astro-island hydration bootstrap, JSON-LD blocks, any non-`is:inline` script written in a `.astro` file) and bakes them into a per-page `<meta http-equiv="Content-Security-Policy">` tag, regenerated on every build. This governs `script-src`, `style-src`, and whatever else is listed in `security.csp.directives`.
2. **`vercel.json`'s header CSP** only adds `frame-ancestors 'none'` — the one directive a `<meta>` CSP cannot express (must be an HTTP header per spec). Do not add `script-src`, `style-src`, or `default-src` back into the header: a second policy with `default-src 'self'` and no script-src would re-block scripts via fallback even though the meta tag allows them — CSP policies are combined as the *intersection* of every active policy, not a single merged list.

**Past incident, don't repeat it:** an earlier strict CSP (`script-src 'self'`, no hashes, no `unsafe-inline`) silently blocked Astro's inline hydration bootstrap script. The page looked fine — static HTML rendered, no visible console error reported by the user — but the Preact island never hydrated, so `PdfMergeTool.jsx`'s `onChange` handler was never attached. Symptom: clicking "Choose files" still opened the native OS file picker (that part is plain HTML, no JS required), but selecting files did nothing, because nothing was listening. **If file selection or any other island interaction silently does nothing in production but works in `npm run dev`, suspect the CSP first** — check the browser's actual CSP violation console errors (look past just "no JS errors," CSP violations log as their own category) and diff `dist/index.html`'s generated `<meta>` CSP hash list against the actual inline scripts present (see git history of this file's commit "Fix CSP blocking the merge tool from hydrating at all" for the exact verification method: extract every `<script>` tag's body, sha256+base64 it, confirm it's in the meta tag's hash list — `type="application/ld+json"` scripts are exempt, since CSP's `script-src` only governs executable script types, not data blocks).

**`is:inline` scripts are NOT auto-hashed.** Astro's CSP hashing only covers scripts that go through its bundling pipeline. If you need a literal inline script, either give it manually-computed hashes via `security.csp.scriptDirective.hashes` (fragile — breaks silently if you ever edit the script content), or — strongly preferred — drop `is:inline` and let Astro bundle it normally (see `BaseLayout.astro`'s service worker registration script for the working pattern). A bundled/processed script gets its hash added automatically and never goes stale.

**A `<style is:inline set:html>` is hashed by the route that owns the `<head>`, not by the component that emits it** (2026-10-01, Dependabot #26). Astro auto-hashes only styles it bundles, so `CompareFigure.astro` and `TheO.astro` register theirs by hand with `Astro.csp.insertStyleHash`. Since astro 7.3.3 (#17857, render performance; 7.3.2 is clean, bisected) the per-page CSP `<meta>` is written when the `<head>` is, before body components have run, so a hash registered from inside a component is silently dropped: the home page and the five pages with a compare figure lost their style (`test:csp`, `csp-smoke` and `compare-figure` all red). `src/site-lib/inlineStyles.ts` holds both style texts and the registrations; `HomePageLayout.astro`, `[contentPage].astro` and `[locale]/[contentPage].astro` call them in their frontmatter. A new `is:inline` style registers the same way, and `npm run test:csp` names a page that misses it.

**This feature is build/preview-only.** Per Astro's own docs, `security.csp` does not apply in `astro dev` — the Vite dev server doesn't support it. This means **the CSP bug class above cannot be reproduced or caught in `npm run dev`** — it only manifests in `npm run build && npm run preview` or the real deployment. Always do a build+preview pass (or check the live Vercel deployment) before considering any change to scripts, `astro.config.mjs`, or `vercel.json` verified.


## CSP is invisible in dev (design-standard hazard)

- **CSP is invisible in dev.** Astro's `security.csp` (auto-hashing of inline scripts/styles) does
  **not** run in `astro dev`, only in `build`/`preview`/production. Any change to styles, scripts,
  `astro.config.mjs`, or `vercel.json` **must** be verified with `npm run build && npm run preview`. A
  silently-blocked hydration bootstrap looks fine (static HTML renders) but the island never hydrates.
  Do not add `script-src`/`default-src` back into the `vercel.json` header CSP: policies intersect, and
  a second `default-src 'self'` re-blocks scripts the meta tag allows.
## CSP style attributes are a separate risk from hashed `<style>` tags

- **CSP style attributes are a separate risk from hashed `<style>` tags, and the intuitive diagnosis is
  wrong.** The editor's runtime geometry writes per-property CSSOM (`el.style.width = ...`), which
  `style-src` does **not** govern: only literal `style="..."` markup, `setAttribute('style', ...)` and
  `.style.cssText =` are checked. When `style-src` violations appeared, the cause was a finite set of
  SSR-serialized static attributes, not the gesture path. The posture is now strict `style-src` with no
  `unsafe-inline` and no `style-src-attr`; `verify-csp.js` fails the build on any literal `style=` in
  `dist/`, and e2e asserts zero `securitypolicyviolation` events. Note that Preact routes object
  `style={{}}` props through per-key `setProperty` (exempt) but string `style="..."` props through
  `cssText` (governed).


## PWA (manifest + hand-written service worker)

There is no PWA build plugin (`vite-plugin-pwa` and `@vite-pwa/astro` were both tried and dropped — see git history "Migrate to Astro" and "Reinstall on patched Astro 7.0.3" commits for why: `vite-plugin-pwa`'s `closeBundle` hook doesn't survive Astro's multi-pass static build, and `@vite-pwa/astro` doesn't yet certify Astro 7). Instead:
- `public/manifest.webmanifest` is a hand-written static file, copied verbatim by Astro.
- `public/sw.js` is a small, hand-written, dependency-free service worker: cache-first-with-background-refresh for navigations, cache-first for every other same-origin asset. `CACHE_VERSION` is **not** hand-bumped - `scripts/generate-precache-manifest.mjs` runs after `astro build`, walks `dist/`, writes `dist/precache-manifest.json` and substitutes a content hash of it for the `__BUILD_ID__` placeholder, so each deploy gets its own cache automatically. It then minifies the result with esbuild (`scripts/minifyServiceWorker.mjs`; `sw.test.mjs` runs the minified text through the same harness), so comments in `public/sw.js` cost visitors nothing.
- **The deploying commit enters `dist/` only as HTML, after the build id is hashed (DEBT-34).** Error reports carry it (`<meta name="pdkef-build">`, written by `BaseLayout.astro` as `__BUILD_COMMIT__` and substituted by `generate-precache-manifest.mjs` beside `__BUILD_ID__`). The first design, a `vite.define` constant in a module only the reporter imports, renamed 38 of 78 `_astro` files per deploy (every tool chunk imports the reporter chunk, and a chunk's hash covers what it imports) and, because `CACHE_VERSION` hashes all of `dist/`, would have made every push, docs-only ones too, re-precache the app for returning visitors. Never put a per-commit value in JS or in any file the build id hashes. `e2e/error-report-build.spec.js` and the CI `VERCEL_GIT_COMMIT_SHA` on the build steps keep the stamped path exercised.
- **Three invariants in `sw.js`, each of which fixed a bug where the page rendered but the PDF silently never appeared. Don't quietly revert them:**
  - **`skipWaiting()` only on the MEM-10 message, never on install.** An update must not take control of a page still running the previous build, because `activate` deletes that build's cache and those pages lazy-import content-hashed chunks (pdfjs, `pdf.worker.min.mjs`, the font TTFs) long after first paint. Activating early pulled the cache out from under a live tab mid-edit. The active worker sends `pdkef:skip-waiting` to the waiting one on a navigation; the waiting worker grants it only when it is ready (install precached every URL and wrote `/__pdkef/precache-complete/`, and the device is online, so offline coverage never shrinks) and every open page (a URL ending in a slash) answered its `pdkef:busy-query` with idle within 750ms. A build whose install missed a URL fetches what is still missing when asked about readiness online, then writes the marker, so one miss never strands an update. Offline, the active worker does not even ask. A tab is busy while it holds `src/lib/appUpdate/updateHolds.ts` (an export in flight, or a file open in a tool without drafts) unless it is navigating away; a tab that does not answer (frozen, or on a build from before MEM-10, which has no reload) counts as busy. Every tab running the new code reloads on `controllerchange` after flushing its draft saves. The navigating tab gets a blank page with a one-second refresh, because Chromium activates only once the old worker is idle. The sw.test.mjs minified-source check pins exactly two `skipWaiting(` calls: this one and the forced takeover below.
  - **`CRITICAL_VERSION` forces the one build that must reach every tab now (MEM-13).** It is an integer in `public/sw.js` that rides in the cache name (`pdkef-c<N>-<build>`; an old `pdkef-<hash>` key reads as 0). Bump it by one, by hand, only for a build that fixes a major bug (data loss, a broken export); every other build leaves it alone and behaves exactly as MEM-10 above. A waiting build whose version is above the lowest one cached (the build the tabs run) runs `tryForcedTakeover()` at the end of install and on `pdkef:critical-check`, which the page sends after it looked for an update (visible, online, hourly). It posts `pdkef:critical-update` to every page window and calls `skipWaiting()` once each replied `{ ready: true }` or after `CRITICAL_TAKEOVER_CAP_MS` (75s), then every tab reloads on `controllerchange`. A force overrides a file open in a draftless tool and a tab that does not answer; it still waits for an export in flight (the page caps that at 60s) and for pending draft saves to flush. It runs only when `readyToTakeOver()` holds, so offline, or before the precache is complete, it does nothing and shows nothing; the check retries when the device is back online. On the first bump after MEM-13 ships, a tab still running pre-MEM-13 code cannot answer the force: the worker goes ahead at its cap, and that tab reloads only once its own holds release (its old controllerchange handler waits for them), so keep the first bump for a real need too.
  - **Precaching is best-effort per URL**, except `/` (the offline navigation fallback), which must succeed. The manifest is the entire build, so on a weak connection something will fail; failing the whole install left the visitor with no offline shell at all and re-downloaded the whole site on every subsequent visit. A missed asset still loads from the network and is cached on first use. Requests go through a small concurrency pool for the same reason.
  - **A 404 on the manifest makes the worker uninstall itself** (`OrphanedWorkerError` → `removeSelf`), and cache deletion is scoped to the `pdkef-` prefix. A worker installed by `npm run preview` is scoped to the *origin*, which on localhost is just a port, so it kept serving that build's assets cache-first to `astro dev` afterwards. The page then got modules from two different Vite optimize passes and hydration died on `Cannot read properties of undefined (reading '__H')` in `preact_hooks` - with nothing in the console naming the cache. The tell is two different `?v=` hashes on `preact.js` and `preact_hooks.js` in the Network tab; Vite stamps one `browserHash` per optimize pass, so two means two generations are live at once. Prefer different ports for `dev` and `preview` regardless.
- Registration lives in `BaseLayout.astro` as a non-`is:inline` script (see the CSP section above for why it must not be `is:inline`). It registers only when `import.meta.env.PROD`; in dev it does the opposite and actively unregisters any worker plus deletes any `pdkef-` cache, so a leftover preview worker heals on the next reload instead of poisoning the dev server indefinitely.

`/api/report` (DEBT-17) is a same-origin beacon POST, so `connect-src 'self'` is untouched. The service worker must not intercept it: `public/sw.js`'s fetch handler only handles GET plus the share-target POST (every other method returns before `respondWith`), so the beacon always goes straight to the network. Keep it that way.

Icons referenced in the manifest are generated and live in `public/icons/` (`icon-192`, `icon-512`, `icon-512-maskable`, `apple-touch-icon`, plus `favicon-16`/`favicon-32`).


## Astro/Vercel version pinning - don't casually upgrade

Astro is pinned to `^7.0.3`, not the `@vite-pwa/astro`-certified `^5.x` line, **on purpose**: `npm audit` showed Astro's own published security advisories (XSS via `define:vars`, slot names, spread props; SSRF) cover every version through `7.0.0-beta`, including all of 5.x. Downgrading to satisfy some other package's peer range would mean shipping a known-vulnerable Astro. If a future dependency wants an older Astro, re-verify with `npm audit` before downgrading — don't assume an older major is safer just because more tooling has caught up to it.


- **`legacy-peer-deps` is a smell, not a fix.** Astro is pinned to `^7.0.3` on purpose (security
  advisories cover every version through 7.0-beta). Any tool that forces `legacy-peer-deps` to install
  must be re-audited against that pin before adoption.

## CI guard

1. **CSP hash gate** (`verify-csp.js`) - the generated `<meta>` CSP still covers every emitted inline
   script/style, and no element carries a literal `style="..."` attribute.

