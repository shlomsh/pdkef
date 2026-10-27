---
id: "SCAN-03"
title: "The Scan guide photos load lazily"
status: "done"
priority: "P3"
epic: "polish"
depends_on: []
---

# SCAN-03 · The Scan guide photos load lazily

*Filed 2026-10-27* from the loading measurement before MEM-15.

## Why

- The Scan to PDF page renders its guide photos (`/images/scan-guide/*`, listed in `src/data/tools.js`
  from line 560) eagerly: about 612 KB at desktop width on a first visit, most of it below the fold.
- Since MEM-15 these photos are runtime-only (`RUNTIME_ONLY_IMAGE_DIRS` in `precachePolicy.js`), so they
  load when shown; only the eager loading on page load remains.

## Outcome

- Guide photos below the first screen carry `loading="lazy"` with their width and height set, so they do
  not move the layout when they arrive.

## Acceptance

- [x] A first visit to /scan-to-pdf/ at desktop width requests no guide photo below the fold before
      scrolling (measured, written in the Done section).
- [x] `npm run test:weight` stays green.

## Done

*2026-10-27.* The guide photos were already `loading="lazy"`, `decoding="async"` with width and height
(`ToolExamplesCard.astro`, `CompareFigure.astro`); `src/components/toolExamples.test.js` now guards that.
The 612 KB came from headless Chromium with no connection type, where Chrome's lazy-load look-ahead is
widest. First visit to /scan-to-pdf/, before any scroll, on a production build:

- 4G emulated: desktop 1280x800 fetches 2 photos (222,696 bytes, both within Chrome's 1,250 px look-ahead
  below the fold); phone 390x844 fetches none.
- No connection type: all 10 (753,109 bytes) at desktop, 5 at phone.

Deferring further would need script on the SEO surface, which the invariants rule out.
