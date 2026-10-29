---
id: "MEM-27"
title: "A tool-layout style edit does not re-download every tool page"
status: "in_progress"
priority: "P3"
horizon: "now"
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

## Measured (2026-10-29)

Decision taken: `build.inlineStylesheets: 'auto'`, with MEM-26's stable `/shared/` CSS names. It landed
with MEM-26 (9484d933, 626b6b6e) and was reverted the same day; see Reverted below.
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

## Reverted (2026-10-29)

CI run 40868063216 on 626b6b6e failed 8 e2e tests that the local `check:push` does not run:
`e2e/tool-hero-first-screen.spec.js` (the hero is 130px at first paint, 72px once the tool loads: the
Merge restore and the home-launcher hand-offs to split and compress-image) and both
`*-saved-work-restore-acceptance.spec.js` (Sign and Redact, visual churn on restore). Reproduced locally:
the hand-off spec fails with `'auto'` and passes with `'always'` on the same commit, and all 115 tests in
the three specs pass on the MEM-26-only build. Both MEM-27 commits were reverted, which restores
`'always'`, the inline-only CSS guards and `continue-on-error`.

Next: find which first-paint rule `'auto'` delivers late or out of cascade order (the loaded-state hero
height), fix that, run those three specs and `check:e2e` locally, then land again with the guards
(`scripts/pageCss.mjs`, recoverable from 9484d933 and 626b6b6e).

Also seen on a phone at 14:32, a minute after the revert went live (Shlomi's screenshot): Merge's file
list showed bullets and bare remove buttons while the rest of the page was styled. Under `'auto'` the
file-list rules live only in the linked `/shared/PdfMergeTool-0da6a7.css`; the revert build no longer has
it (pdkef.com answers 404), so a MEM-27 page that asks for it after the swap loses those rules.
Reproduced by serving the `'auto'` build of `/merge/` without that one file. The re-land has to cover
it: a page from one deploy keeps linking sheets the next deploy may not emit, so either keep the
previous deploy's `/shared/` sheets reachable or make a missing sheet impossible to strand a page.

