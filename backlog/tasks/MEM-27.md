---
id: "MEM-27"
title: "A tool-layout style edit does not re-download every tool page"
status: "open"
priority: "P3"
horizon: "later"
epic: "robustness"
depends_on: ["MEM-26"]
---

# MEM-27 · A tool-layout style edit does not re-download every tool page

*Filed 2026-10-28* from the update-cost nightly (MEM-21).

## Why

- `build.inlineStylesheets: 'always'` (`astro.config.mjs`, measured to win first paint on 2026-08-20)
  puts `ToolPageLayout.astro` and `ToolStage.astro` styles inline in each of the 22 tool pages. 1b72a77 to
  686e27e changed 10 lines of that CSS and costs a returning client 791,557 bytes, every tool page at
  35-49 KB brotli each.
- The first-paint decision stands; this is about what an update downloads, which that measurement did
  not weigh.

## Outcome

- A decision, measured on both axes (first paint and update cost), on whether shared tool-layout CSS
  moves to one hashed stylesheet, stays inline, or splits. Record it beside the `inlineStylesheets`
  comment in `astro.config.mjs` either way.

## Acceptance

- [ ] Both numbers measured for the options, on the same pages as the 2026-08-20 benchmark.
- [ ] The decision and its numbers are in `astro.config.mjs`'s comment.
