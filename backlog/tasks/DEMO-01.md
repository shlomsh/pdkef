---
id: "DEMO-01"
title: "Type roles and vertical rhythm tokens for the marketing surface"
status: "open"
priority: "P1"
epic: "landing-story-demo"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# DEMO-01 · Type roles and vertical rhythm tokens for the marketing surface

## Scope and acceptance

**The static surface sizes and spaces itself by hand, so nothing scales and nothing is consistent.** `src/pages/index.astro` alone carries `text-[1.6rem]`, `text-[0.98rem]`, `text-[0.92rem]`, `text-[0.85rem]`, `mb-16`, `mb-12`, `p-6` and a dozen more one-off values, and the eight content-collection pages repeat the pattern. Two sizes that should match differ by 0.02rem because they were typed separately, and a heading that should scale on a phone does not scale at all.

Introduce two token families in `src/styles/global.css` and apply them.

**Fluid type roles.** `--type-hero-size`, `--type-section-size`, `--type-feature-size`, `--type-card-size`, `--type-lead-size`, `--type-body-size`, each a `clamp()` so it scales between 390px and 1200px without a media query. Each gets a one-line class that also fixes weight, letter-spacing and line-height, so a heading is a *role* rather than a size: display roles want a tight tracking and a line-height near 1.05, body wants 1.55.

**Vertical rhythm.** `--space-section-block`, `--space-heading-content`, `--space-content-row`, `--space-layout-gap`, also `clamp()`, applied through four one-line utilities (`padding-block`, `margin-block-end`, `padding-block-end`, `gap`). Every vertical gap on the marketing surface should come from these four.

Use logical properties throughout (`padding-block`, `margin-inline`, `text-start`, `margin-inline-start`) rather than physical ones. Hebrew is a first-class concern in this product and an RTL marketing surface should not need a rewrite to become possible.

Note the `@theme`-omission trap in CLAUDE.md: a Tailwind utility whose scale step is not declared compiles to no CSS at all, silently. Declare before use.

**Acceptance.** The marketing sections of `index.astro`, the tool pages and `src/pages/[contentPage].astro` use the roles instead of arbitrary sizes. `npm run test:css` passes (both `check-dead-utilities.js` and `check-class-resolution.js`). `check-css-duplication.js` and `check-page-weight.js` do not regress; this should remove distinct bytes rather than add them, so if it adds any, say why. Verified by eye at 390px and 1200px.
