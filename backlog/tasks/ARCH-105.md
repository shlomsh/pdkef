---
id: "ARCH-105"
title: "The size ratchet also records functions over 150 lines and nesting depth"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
depends_on: []
---

# ARCH-105 · The size ratchet also records functions over 150 lines and nesting depth

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding S5.
Area: Code. Criterion: Size and complexity. Structure only: no behaviour change.

## Why

- `scripts/ratchet-limits.json` records only files over 800 and functions over 300 lines; 87 functions over 100 lines go unguarded.
- Deep nesting is unguarded too (`outline.ts:256` nests 7).

## Outcome

- A 150-line function tier and a nesting cap in `check-size-ratchet.mjs`.

## Acceptance

- [ ] Growing a recorded function or adding one past 150 lines fails CI.
- [ ] Exceeding the nesting cap fails CI unless the site is recorded.
