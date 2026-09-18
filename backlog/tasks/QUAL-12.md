---
id: "QUAL-12"
title: "Mint and paper leftovers: the redaction guide illustration and the hero's duplicated fallback"
status: "open"
priority: "P3"
epic: "site-quality"
phase: "quick-win"
depends_on: ["QUAL-11"]
legacy_state: "Open"
---

# QUAL-12 · Mint and paper leftovers

*Filed 2026-09-18 from the QUAL-11 review.*

## Problem

Two places still carry Sea Glass after the retheme, both outside the token
system so no guard catches them.

- `public/images/redaction-guide/flatten.svg` hardcodes `stroke="#c4e1e6"`,
  the old sunken surface, six times. It renders on the blur-vs-blackout guide
  and now sits grey-teal on a mint and off-white page.
- `src/layouts/HomePageLayout.astro` reads `var(--home-workspace, #c3f0e6)`
  for the tour backdrop: a literal fallback that duplicates the value declared
  a few lines above and has to be kept in step by hand on every retheme.

## Scope

- Recolour the illustration to the current tokens' values (mint `#a5e9dd`
  for the old sunken strokes, deep teal `#007979` for the old primary), or
  regenerate it from whatever produced it.
- Drop the fallback or make the declaration the single source, and add the
  illustration to the "changing the theme" checklist in
  `.claude/rules/styling.md` if it stays hand-coloured.

## Acceptance

- `grep -rn "c4e1e6\|3e7c8d" public/images src/layouts` returns nothing.
- The guide page reads as one palette on the dev server.
