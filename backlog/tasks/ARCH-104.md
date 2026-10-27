---
id: "ARCH-104"
title: "ToolHero.astro is split into per-section components"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-104 · ToolHero.astro is split into per-section components

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding S4.
Area: Code. Criterion: Size and complexity. Structure only: no behaviour change.

## Why

- `src/components/ToolHero.astro` is 767 lines, under the 800 threshold, and the ratchet does not measure functions in it.

## Outcome

- Per-section `.astro` components for the hero.

## Acceptance

- [ ] `ToolHero.astro` is split and no part is over 400 lines.
- [ ] The page-family sheet test (`npm run test:css`) still passes.
