---
id: "MEM-27"
title: "A tool-layout style edit does not re-download every tool page"
status: "done"
priority: "P3"
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

- [x] Both numbers measured for the options, on the same pages as the 2026-08-20 benchmark.
- [x] The decision and its numbers are in `astro.config.mjs`'s comment.

## Done (2026-10-29)

Decision: `build.inlineStylesheets: 'auto'`, with MEM-26's stable `/shared/` CSS names, landed in the
same change as MEM-26. Recorded beside the setting in `astro.config.mjs` and in `.claude/rules/styling.md`.
The 2026-08-20 benchmark left no page list or script, so first paint was measured on `/`, `/sign/`,
`/merge/` and `/compress/`.

| Option | 42923db to 1b72a77 | 1b72a77 to 686e27e | Slow 4G FCP vs inline |
| --- | --- | --- | --- |
| `'always'` (inline) | 787,290 | 782,106 | baseline |
| `'auto'` | 37,701 | 32,468 | +180 to +196 ms |
| `'never'` | 37,204 | 31,979 | +216 to +400 ms |

- **Update cost** is brotli bytes a returning visitor's worker downloads, both sides built at one path
  with MEM-26 applied.
- **First paint** is Chromium with CDP throttling, cold, no worker, median of 7. `'auto'` against
  `'always'`, FCP on `/`, `/sign/`, `/merge/`, `/compress/`: slow 4G +188, +196, +184, +180 ms; fast 4G
  +56, -56, +20, +56; broadband +16, +40, +20, +24. `'never'` links 4 to 15 sheets per page.
- **Lighthouse** 13.5 mobile (simulated throttling, local static server, median of 3), inline then
  `'auto'`: `/` 97 to 96, `/sign/` 88 to 89, `/merge/` 90 to 92, `/compress/` 95 to 97. The local server
  already put `/sign/` and `/merge/` under 95 before the change, so these are deltas, not the production
  reading.
- **Guards:** `scripts/pageCss.mjs` gives a page's CSS as its inline blocks plus linked sheets;
  `check-css-duplication.js` and `check-dead-utilities.js` read it, and `check-page-weight.js` adds linked
  sheets to the first-load budget (`/sign/` 194,425 of 400,000). On the `'auto'` build before this, dead
  utilities failed on 682 classes and page weight passed without counting any linked sheet. Tool pages
  now form one duplication family (0.37x, limit 0.46x).
- **Naming fix found on the way:** Astro's page CSS (`redact@_@astro.css`) missed the module-set lookup
  and fell back to a hashed `/_astro/` name; `test:stable-names` caught it on the first `'auto'` build.

