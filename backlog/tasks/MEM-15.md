---
id: "MEM-15"
title: "The precache is built from per-page import closures: the install caches their union, not every file in dist/"
status: "done"
priority: "P2"
epic: "robustness"
horizon: "now"
order: 2
depends_on: []
---

# MEM-15 · The precache is built from per-page import closures: the install caches their union, not every file in dist/

*Filed 2026-10-27* from a loading measurement of origin/main (chromium, `astro preview`, fresh context
per run). Shlomi chose the scope on 2026-10-27: the service worker downloads what the visited tool needs,
not the whole build.

## Why

- `src/site-lib/precachePolicy.js` precaches everything in `dist/` except fonts: 266 URLs, 13.2 MB raw,
  about 5.2 MB on the wire. Every first visit to any page downloads all 38 HTML pages, 113 JS files,
  4 wasm files, the 754 KB of Scan guide photos and Sign's 763 KB export chunk.
- The visited tool needs a fraction of that. /redact/ loads 244 KB at first paint, 395 KB more on
  opening a PDF, plus the 301 KB (brotli) pdf.js worker: about 0.94 MB. The precache adds 5.2 MB on top.
- The cost grows with the suite: each new tool adds to every visitor's install, whichever tool they use.
- The policy comment's reason for "precache the app" is that per-page dependency graphs were not
  available to the filter. `scripts/check-lazy-modules.js` already walks per-page static closures from
  the built HTML, so the information exists at build time.

## Decision (2026-10-27)

- First scope: a visit caches the shell plus the visited page's closure only. Built and reviewed on the
  `precache` branch.
- Changed the same day by Shlomi: the copy promises "install it once and every tool works offline" in
  39 places, and per-tool caching left returning users without offline use for tools they had not
  reopened. The install caches the whole app, defined as the union of the per-page closures.
- This holds only while the whole app is a handful of MB. **If the install exceeds 5 MB on the wire,
  revisit and bring per-tool caching back.** MEM-18's install budget is that trigger.

## Outcome

- The build writes one closure per page into the precache manifest: the page's HTML, its static import
  closure, its dynamic imports (the PDF engines, the pdf.js worker, the wasm files it reaches) and the
  default font only where the page reaches it. A shell entry (`/` and what every page shares) is
  separate.
- The service worker installs the shell plus every page's closure, deduped. Files no page reaches, and
  the Scan guide's photos (cached at runtime when shown), are not precached.
- The closure computation is a pure function over the build output, beside `precachePolicy.js`, with unit
  tests. `check-lazy-modules.js` and the manifest generator share it instead of each walking imports.

## Acceptance

- [ ] A first visit caches no Scan guide image and no file that no page's closure reaches.
- [ ] `e2e/offline/offline-workflows.spec.js` stays green: each tool it covers still completes offline
      after one online visit to any page.
- [ ] The install's precached bytes are measured, before and after, and written in this ticket's Done
      section.
- [ ] Every copy line that promises offline use is checked against the new scope.

## Done (2026-10-27)

- `scripts/precacheClosure.mjs`: pure closure functions over the build output (HTML refs, static and
  dynamic imports, `__vite__mapDeps`, the pdf.js worker, wasm files a chunk names, eager `<img>` and
  `/images/` files a chunk names), shared by `check-lazy-modules.js` and the manifest generator. The
  Scan guide photos are runtime-only (`RUNTIME_ONLY_IMAGE_DIRS` in `precachePolicy.js`).
- Manifest v2 `{version, shell, pages}`; `public/sw.js` installs `appUrls` = shell plus every page list,
  deduped (183 URLs). The per-page scope was built first, then replaced by the decision above; its page
  packs and the LOC-02 locale packs are gone (localized pages are in the install).
- Measured (production build, brotli q5 server, fresh profile, worker requests until precache-complete):
  before 268 requests and 5,202,979 wire bytes on every page; after 185 requests and 3,768,484 wire bytes
  on every page (183 of 183 URLs cached). No Scan guide photo and no file outside the closures is fetched;
  the only worker requests outside the union are `/sw.js` and the manifest.
- Offline copy checked: with the whole app installed, the 39 lines that promise "install once, every
  tool works offline" hold again (list in the session scratchpad, not needed now).
- `e2e/offline/` green, 12/12, including a new case: a fresh visit to `/` alone makes `/compress/` and
  `/he/merge/` open and hydrate offline.
