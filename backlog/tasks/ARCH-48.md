---
id: "ARCH-48"
title: "The components layer holds only .astro files, and its special rule goes"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
order: 4
depends_on: []
---

# ARCH-48 · The components layer holds only .astro files, and its special rule goes

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Architecture. Criterion: Layering and dependency direction. Structure only: no behaviour change.

## Why

- The `components` classification survives for a few non-`.astro` files (`src/components/inlineStyles.ts`, `HeroDemo/`), with a dedicated rule 5 and special cases in `classify()`.
- `inlineStyles.ts` imports `site-lib`, a components to site edge no rule describes.

## Outcome

- `inlineStyles.ts` and the HeroDemo island code move to the layer their imports place them in; rule 5 and the special cases are removed.

## Acceptance

- [ ] `classify()` has no components special case; the boundary check is green.
