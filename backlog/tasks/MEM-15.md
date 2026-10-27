---
id: "MEM-15"
title: "The precache manifest is per page: a visit caches the shell plus that page's import closure"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "now"
order: 2
depends_on: []
---

# MEM-15 · The precache manifest is per page: a visit caches the shell plus that page's import closure

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

## Outcome

- The build writes one closure per page into the precache manifest: the page's HTML, its static import
  closure, its dynamic imports (the PDF engines, the pdf.js worker, the wasm files it reaches) and the
  default font only where the page reaches it. A shell entry (`/` and what every page shares) is
  separate.
- The service worker installs the shell. Each controlled page then asks for its own closure, and only
  that closure is fetched. A page from another tool adds its own closure when it is visited.
- The closure computation is a pure function over the build output, beside `precachePolicy.js`, with unit
  tests. `check-lazy-modules.js` and the manifest generator share it instead of each walking imports.

## Acceptance

- [ ] A first visit to /redact/ caches no Scan guide image, no Sign export chunk and no other tool's HTML.
- [ ] `e2e/offline/offline-workflows.spec.js` stays green: each tool it covers still completes offline
      after one online visit to that tool's page.
- [ ] The precached bytes for /redact/, /sign/ and /compress/ are measured and written in this ticket's
      Done section.
- [ ] Every copy line that promises offline use is checked against the new scope (offline after you
      opened the tool once). Any line that promises more is listed for Shlomi, not rewritten here.
