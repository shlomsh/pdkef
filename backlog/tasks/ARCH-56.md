---
id: "ARCH-56"
title: "Home and tool page layouts are composed of section components"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "now"
order: 7
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

- [ ] Built HTML for the home page and every tool page is unchanged (diff of `dist/`).
- [ ] No layout file over 400 lines.
