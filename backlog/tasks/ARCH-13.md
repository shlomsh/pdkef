---
id: ARCH-13
title: Restore CSS delivery-budget headroom
status: open
priority: P2
epic: editor-architecture
phase: near-term
depends_on: []
---

## Problem

The CSS release gate is green but has effectively exhausted its safety margin. On 2026-09-03,
`npm run test:css` reported a 9.46x duplication factor against a 9.60x limit and 27,683 dead bytes
on `/licenses/` against a 27,750-byte limit. Across the site, 398,528 bytes are classified as dead
for their page, including 357,236 bytes of utility CSS. A small legitimate UI change can therefore
break the release gate without representing a meaningful regression, which encourages repeated
budget increases instead of correcting the delivery model.

## Scope

- Attribute the repeated and page-dead bytes to their source stylesheets and build configuration.
- Reduce utility/style delivery to routes that do not use it, prioritizing static pages and the
  shared shell before changing editor styles.
- Preserve Astro static output, the production CSP, offline behavior, responsive layouts, and the
  existing CSS Modules ownership boundaries.
- Record before/after measurements and explain any CSS that must remain globally delivered.
- Keep the CSS gate based on generated output; do not make it source-line-count based.

## Acceptance criteria

- The duplication factor and worst-page dead-byte result each have at least 10% headroom below their
  current limits without raising those limits.
- `npm run build`, `npm run test:css`, `npm run test:csp`, `npm run test:weight`, and relevant visual
  or responsive browser checks pass.
- Shared styles are not copied into multiple component modules merely to improve the metric.
- The change includes a short ownership note for global, shell, static-content, and interactive-tool
  CSS so later work does not recreate the duplication.

## Notes

The build also emits Vite's generic warning for a minified chunk over 500 kB, while the route-aware
brotli page-weight gate remains green (`/sign/` was 327,883 of 400,000 bytes). Treat that warning as
a measurement prompt, not as evidence that the CSS fix must also restructure JavaScript chunks.
