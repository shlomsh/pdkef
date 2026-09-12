---
id: "SEO-30"
title: "A two-click demo below the Compress hero, for a visitor who has never used a PDF tool before"
status: "open"
priority: "P2"
epic: "english-base"
phase: "near-term"
depends_on: ["SEO-05", "SEO-13"]
legacy_state: "Open"
---

# SEO-30 · A two-click demo below the Compress hero, for a visitor who has never used a PDF tool before

*Re-filed 2026-09-12* from `search-acquisition` into `english-base`: on-page, no new URL.

## Scope and acceptance

**Where this came from.** Shlomi's review of `/compress/`'s empty state (2026-09-11, alongside SEO-05's
CTR data and SEO-13's positioning review) found it reads as "just a dropzone" until a file is chosen -
the four-option comparison that actually shows what the tool does only appears after the first click.
The redesign in this same session (moving the options grid above the fold, unconditional on `hasFiles`)
closes most of that gap for a visitor who scrolls or already knows what a PDF compressor does. This
ticket is the next layer: a non-technical visitor who has never used one of these tools before and lands
from a portal-size query (`compress pdf to 100kb`, `file compressor to 100kb` - see SEO-05, SEO-13)
should be able to tell, without reading anything, that this takes two clicks: choose a file, compress.

**What this is not.** Not a rebuild of the home page's hero demo (DEMO-02, `HeroDemo.astro`) - that is a
scripted, full-height scroll story load-bearing for the home page's own layout (CLAUDE.md's "the home
page's first screen is one composed unit" and "the demo and the launcher have opposite rendering
constraints" sections). A tool page is not the home page: `/compress/` is a landing page with buyer
intent already established by the query, not a router that needs to sell the *idea* of the suite. The
demo here should be small, static-first, and must not compete with the real dropzone above it or with
the "OUR PICK" options grid SEO-05/this session's redesign just made the primary above-the-fold content.

**Candidate shapes, to choose between rather than default to the fanciest:**
- A short static sequence (2-3 frames, no video, no canvas animation) showing a generic file icon
  landing on the dropzone, then a compressed-size result card - built the same way `HeroDemo`'s static
  frames are, or simpler.
- A single annotated screenshot-style illustration with two numbered callouts ("1. Choose a file",
  "2. Compress") pointing at the real dropzone and the real primary button already on the page, so the
  visitor's eye is directed at the actual controls instead of a separate simulated UI.
- Reject building a second, fake interactive dropzone purely for demonstration - CLAUDE.md's "one tool,
  one job" and the SEO shell's zero-JS-for-marketing-content rule both argue against a decorative
  interactive element that isn't the real tool.

**Acceptance.**

- Static-first: no client JS required for the demo to be visible and make sense, consistent with the SEO
  shell invariant (Part I §1.1) - crawlers and no-JS visitors see it too.
- Does not push the real dropzone or options grid below the fold on a common viewport (390-430px mobile,
  1280-1440px desktop) - measure before shipping, the same discipline as the home page's CLS notes.
- Does not duplicate copy already on the page (subhead, "How it works" card) - if the demo needs a
  caption, it names the two steps, nothing else.
- No claim beyond what the tool does today (no "instant", no invented percentage not already in
  `COMPRESSION_LEVELS`).
- `npm run build && npm run preview` pass (CSP is invisible in `astro dev` - CLAUDE.md's CSP section);
  `npm run test:css`, `npm run test:seo` pass; page-weight budget (`check-page-weight.js`) checked
  before and after, since this adds an image or inline SVG to a page that currently carries none beyond
  icons.
- Decide, and record the reasoning, on whether this ships on `/compress/` only or is worth the same
  treatment on other high-traffic tool pages (`/redact/`, per SEO-14's finding it's 64% of clicks) - do
  not silently generalize to all nine tool pages without that decision being made explicitly, since
  CLAUDE.md's anti-doorway-page discipline applies to templated additions as much as templated pages.
