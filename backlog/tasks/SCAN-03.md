---
id: "SCAN-03"
title: "The Scan guide photos load lazily"
status: "open"
priority: "P3"
epic: "polish"
horizon: "later"
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

- [ ] A first visit to /scan-to-pdf/ at desktop width requests no guide photo below the fold before
      scrolling (measured, written in the Done section).
- [ ] `npm run test:weight` stays green.
