---
id: "ARCH-105"
title: "The size ratchet also records functions over 150 lines and nesting depth"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
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

- [x] Growing a recorded function or adding one past 150 lines fails CI.
- [x] Exceeding the nesting cap fails CI unless the site is recorded.

## Closed 2026-10-27

`check-size-ratchet.mjs` records every function over 150 lines under a top-level `functionSize` section and every function nested past 4 control blocks (ESLint max-depth counting) under `nesting`; the 300-line tier folded into it. Tests were added first and seen failing. A review found anonymous callbacks were keyed by position, so inserting one renamed the rest; functions sharing a name are now paired by size within their file and parent, test-first. Baseline: 49 functions over 150, 11 nested past 4.
