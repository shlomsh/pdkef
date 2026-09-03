---
id: "QUAL-02"
title: "Two competing header padding rules, where specificity beats the media query"
status: "open"
priority: "P2"
epic: "site-quality"
phase: "near-term"
depends_on: []
legacy_state: "Open"
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
