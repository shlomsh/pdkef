---
id: "DEMO-06"
title: "Decide the visual register: keep Sea Glass or move to warm paper"
status: "open"
priority: "P3"
epic: "landing-story-demo"
phase: "later"
depends_on: []
legacy_state: "Open"
---

# DEMO-06 · Decide the visual register: keep Sea Glass or move to warm paper

## Scope and acceptance

**A decision ticket, not a commitment to repaint.** The current Sea Glass palette (cool teal, white surfaces, 10/16/22px radii, `shadow-md` on most cards) reads as capable but generic. A warm paper-and-ink register (paper ground, near-black ink, 2 to 6px radii, hairline rules instead of shadows, a mono label, one long soft shadow) is thematically closer to what a PDF tool actually is, and it is the register the DEMO-04 receipt wants to live in.

Sea Glass was a deliberate recent choice and is documented as such in CLAUDE.md, so this is a taste call to make explicitly rather than drift into.

Produce a side-by-side of the hero and one tool page in both registers, decide, and record the decision and its reasoning. If the answer is to stay, say so and close this; the two cheap pieces below are worth taking either way.

**Worth taking regardless of the outcome.** Tighter radii and `border` plus `shadow-xs` in place of `shadow-md`, which moves the register from consumer app toward tool. And a section vignette: an `isolation: isolate` element with a pseudo-element carrying two radial gradients, light from the top and a faint darkening at the bottom, which gives long pages structure for a handful of CSS lines, no images and no JS.

**If the answer is to move.** It is a token-only change by construction, so the work is in `:root` in `global.css` plus the two places that do not read CSS variables: `theme-color` in `BaseLayout.astro` and `theme_color`/`background_color` in `public/manifest.webmanifest`. Then `grep -rn "rgba(0\|#[0-9a-f]\{6\}"` across `src/` and `public/` for the literals that historically escaped the variable system, and re-check contrast against WCAG 2.1 AA: 4.5:1 body, 3:1 large text.
