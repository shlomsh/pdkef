---
paths:
  - "astro.config.mjs"
  - "vercel.json"
  - "src/layouts/**"
  - "src/components/SeoSchema.astro"
  - "src/components/OrganizationSchema.astro"
  - "scripts/verify-csp.js"
  - "e2e/csp-smoke.spec.js"
---

# CSP, inline scripts, the service worker, and dependency pinning

Loaded when touching anything that changes what scripts or styles the browser is allowed to run, or
what the service worker caches. The headline is in CLAUDE.md: **CSP is invisible in `astro dev`, so any
change here is verified only by `npm run build && npm run preview`.** This file is the mechanism and
the incidents.

Before changing what a page loads, what the worker installs, how client code is bundled or a caching
header, read [docs/offline-and-requests.md](../../docs/offline-and-requests.md): the offline-first stance, the
per-request bill, the bundling rule and the assumptions each decision rests on, with how to re-measure them.

The service worker, manifest and precache moved to `service-worker.md`; version pinning to
`dependency-pinning.md`. Each loads with its own files.

## Content-Security-Policy

The CSP is intentionally split across two layers:

1. **`astro.config.mjs`'s `security.csp`** (Astro 6+ built-in feature) auto-computes sha256 hashes for every inline `<script>`/`<style>` Astro emits or processes (the astro-island hydration bootstrap, JSON-LD blocks, any non-`is:inline` script written in a `.astro` file) and bakes them into a per-page `<meta http-equiv="Content-Security-Policy">` tag, regenerated on every build. This governs `script-src`, `style-src`, and whatever else is listed in `security.csp.directives`.
2. **`vercel.json`'s header CSP** only adds `frame-ancestors 'none'` — the one directive a `<meta>` CSP cannot express (must be an HTTP header per spec). Do not add `script-src`, `style-src`, or `default-src` back into the header: a second policy with `default-src 'self'` and no script-src would re-block scripts via fallback even though the meta tag allows them — CSP policies are combined as the *intersection* of every active policy, not a single merged list.

**Past incident, don't repeat it:** an earlier strict CSP (`script-src 'self'`, no hashes, no `unsafe-inline`) silently blocked Astro's inline hydration bootstrap script. The page looked fine — static HTML rendered, no visible console error reported by the user — but the Preact island never hydrated, so `PdfMergeTool.jsx`'s `onChange` handler was never attached. Symptom: clicking "Choose files" still opened the native OS file picker (that part is plain HTML, no JS required), but selecting files did nothing, because nothing was listening. **If file selection or any other island interaction silently does nothing in production but works in `npm run dev`, suspect the CSP first** — check the browser's actual CSP violation console errors (look past just "no JS errors," CSP violations log as their own category) and diff `dist/index.html`'s generated `<meta>` CSP hash list against the actual inline scripts present (see git history of this file's commit "Fix CSP blocking the merge tool from hydrating at all" for the exact verification method: extract every `<script>` tag's body, sha256+base64 it, confirm it's in the meta tag's hash list — `type="application/ld+json"` scripts are exempt, since CSP's `script-src` only governs executable script types, not data blocks).

**`is:inline` scripts are NOT auto-hashed.** Astro's CSP hashing only covers scripts that go through its bundling pipeline. If you need a literal inline script, either give it manually-computed hashes via `security.csp.scriptDirective.hashes` (fragile — breaks silently if you ever edit the script content), or — strongly preferred — drop `is:inline` and let Astro bundle it normally (see `BaseLayout.astro`'s service worker registration script for the working pattern). A bundled/processed script gets its hash added automatically and never goes stale.

**A `<style is:inline set:html>` is hashed by the route that owns the `<head>`, not by the component that emits it** (2026-10-01, Dependabot #26). Astro auto-hashes only styles it bundles, so `CompareFigure.astro` and `TheO.astro` register theirs by hand with `Astro.csp.insertStyleHash`. Since astro 7.3.3 (#17857, render performance; 7.3.2 is clean, bisected) the per-page CSP `<meta>` is written when the `<head>` is, before body components have run, so a hash registered from inside a component is silently dropped: the home page and the five pages with a compare figure lost their style (`test:csp`, `csp-smoke` and `compare-figure` all red). `src/components/inlineStyles.ts` holds both style texts and the registrations; `HomePageLayout.astro`, `[contentPage].astro` and `[locale]/[contentPage].astro` call them in their frontmatter. A new `is:inline` style registers the same way, and `npm run test:csp` names a page that misses it.

**This feature is build/preview-only.** Per Astro's own docs, `security.csp` does not apply in `astro dev` — the Vite dev server doesn't support it. This means **the CSP bug class above cannot be reproduced or caught in `npm run dev`** — it only manifests in `npm run build && npm run preview` or the real deployment. Always do a build+preview pass (or check the live Vercel deployment) before considering any change to scripts, `astro.config.mjs`, or `vercel.json` verified.


**The video is the second Google exception (SEO-59).** `/redact/` (`ToolPageLayout.astro`) and the English home page (`HomePageLayout.astro`) add `frame-src https://www.youtube-nocookie.com`; `verify-csp.js` fails it anywhere else. `VideoPoster.astro` makes the frame only on press, so a visitor who never plays it never reaches Google. Never preload the frame or load it on scroll.

## CSP is invisible in dev (design-standard hazard)

- **CSP is invisible in dev.** Astro's `security.csp` (auto-hashing of inline scripts and styles) does
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

## CI guard

1. **CSP hash gate** (`verify-csp.js`) - the generated `<meta>` CSP still covers every emitted inline
   script/style, and no element carries a literal `style="..."` attribute.
