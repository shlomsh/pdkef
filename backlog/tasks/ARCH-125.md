---
id: "ARCH-125"
title: "The color-literal check also covers TSX style props"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-125 · The color-literal check also covers TSX style props

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding Y4.
Area: Supporting. Criterion: Styling architecture. Structure only: no behaviour change.

## Why

- The color-literal check scans `.css` only; about 73 literals remain in `.tsx` and `.astro` (for example `src/tools/sign/components/ElementToolbar.tsx:245`), mostly document palettes and flag colors (inferred).

## Outcome

- The check extended to TSX style props with a palette allowlist.

## Acceptance

- [x] A new color literal in a TSX style prop fails CI unless allowlisted.

## Done (2026-10-28)

- `scripts/check-color-literals.mjs` also scans JSX `style=` props in non-test `.tsx` files (`style={...}` with a
  balanced-brace scan that skips strings and template literals, and quoted `style="..."`), with the same allowlist
  and stale-entry rules as the CSS scan.
- The one literal it found, a text mark's default ink in `TextNode.tsx`, is document data and is allowlisted.
