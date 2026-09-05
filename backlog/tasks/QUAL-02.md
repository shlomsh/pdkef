---
id: "QUAL-02"
title: "Two competing header padding rules, where specificity beats the media query"
status: "done"
priority: "P2"
epic: "site-quality"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-09-05"
---

# QUAL-02 · Two competing header padding rules, where specificity beats the media query

## Scope and acceptance

**`src/styles/global.css` sets header padding twice, and the wrong one wins everywhere.**

- Around line 308: `header:not(.tool-hero):not(.not-found-header)` sets `padding: 4.5rem 1.5rem 2.25rem`. Specificity **0-2-1**.
- Around line 352: `header:not(.tool-hero)` sets `padding: 3.5rem 1.5rem 1.5rem`, inside a media query. Specificity **0-1-1**.

A media query contributes nothing to specificity, so the first rule wins at every width the second was
written to correct. The intended responsive reduction has therefore never applied to anything. Every
tool page, the eight SEO content pages, `/licenses/` and the 404 page carry 72px of top padding and
36px of bottom padding that nobody asked for, on the most valuable screen real estate they have: the
first viewport, above the fold, on the pages search traffic actually lands on.

The home page was fixed, but only with a scoped override in `index.astro`, so the underlying rule is
untouched and every other page still has the defect. That override should be removed as part of this
work, not left as a second source of truth.

**This is the same shape of bug as the two others found in `global.css` in one day**: a bare or
low-effort element selector quietly deciding something a page thought it controlled, invisible until
someone reads a computed value. It is an argument for the direction Part II of CLAUDE.md already sets
out, where the only global CSS is `:root` tokens. Fixing the two rules is the immediate job; noticing
that the file keeps producing this class of bug is the durable finding.

Note that a separate session may already have started on this. This ticket is the durable record
either way; check before duplicating the work.

**Acceptance.** One rule owns header padding at each breakpoint, with no specificity accident.
The scoped override in `index.astro` is gone and the home page is unchanged visually. Measured
before-and-after header heights for a tool page, a content page, `/licenses/` and the 404, at both a
narrow and a wide viewport. `npm run test:css` and `npm run test:seo` pass, and no page-weight budget
moves.

## Outcome (2026-09-05)

The CSS half landed in f8b57e4, merged by hand from the parallel worktree that
investigated this. Both halves of the pair now carry the identical selector
(`header:not(.tool-hero):not(.not-found-header)`) and both sit in `@layer base`,
so a page's own header utilities win per property while the site default still
covers a page that has no opinion.

That worktree also found something this ticket had not: the media-query rule did
land on exactly one page, `/404/`, which the base rule excludes and the media
rule did not. So the only header it ever governed was the one page that did not
want it, flattening that page's own `pt-[4.5rem] pb-10` to 56px/24px above
768px while mobile kept 72px/40px.

The remaining homepage override is gone. Its equivalent page-owned utilities now
live directly on the homepage header (`px-6 pb-8 pt-14` and the existing 1024px
overrides), so the homepage retains its authored layout without a specificity
countermeasure. Browser measurement confirms its header is unchanged: 393.72px
at 390px and 194.53px at 1440px, with matching computed padding in both builds.

### Browser measurements

Chrome measurements compare the commit immediately before the CSS fix with the
completed build. Values are rendered header heights in pixels; both viewports
were measured at a fixed 844px or 1000px height, respectively.

| page | 390px before → after | 1440px before → after |
| --- | ---: | ---: |
| `/merge/` tool | 425.17 → 425.17 | 141.69 → 141.69 |
| `/how-to-sign-a-pdf-on-android/` content | 421.86 → 393.86 | 380.05 → 430.64 |
| `/licenses/` | 208.09 → 208.09 | 216.94 → 188.94 |
| `/404.html` | 397.69 → 397.69 | 400.88 → 432.88 |

The content page's wide header becomes taller because its authored `max-w-[720px]`
now wins over the former global 1080px cap, causing the real title/lead wrapping
to be rendered. Its padding is now the authored 72px/32px rather than the
global 72px/36px. `/licenses/` receives the intended desktop default
(56px/24px), and the 404 regains its authored 72px/40px instead of the accidental
56px/24px desktop override. Tool headers were already excluded and remain
unchanged.

`npm run build`, `npm run test:css`, `npm run test:seo`, and
`npm run test:weight` pass with no page-weight budget adjustment.
