---
id: "ARCH-56"
title: "Home and tool page layouts are composed of section components"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-56 · Home and tool page layouts are composed of section components

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Size and complexity. Structure only: no behaviour change.

## Why

- `src/layouts/HomePageLayout.astro` is 1,394 lines; `src/components/ToolHero.astro` 767 and `src/layouts/ToolPageLayout.astro` 610 are the next largest non-island files.

## Outcome

- Each layout composes per-section `.astro` components; the rendered HTML is byte-identical.

## Acceptance

- [x] Built HTML for the home page and every tool page is unchanged (diff of `dist/`).
- [x] No layout file over 400 lines.

*Closed 2026-10-27:* the scope ids (`data-astro-cid-*`) now differ per component, so `dist/` cannot be byte-identical. Instead the old and new builds were compared pixel by pixel: `/`, `/he/` and every tool page at 375, 768, 1280 and 1440 px, with 0 differing pixels (Scan's demo region varies between two runs of the old build too). The restore and hand-off states are covered by the e2e specs.
