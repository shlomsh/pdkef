---
id: "ARCH-114"
title: "The unused-exports baseline of own-file-only and test-only exports shrinks"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
depends_on: []
---

# ARCH-114 · The unused-exports baseline of own-file-only and test-only exports shrinks

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding X4.
Area: Code. Criterion: Dead code and unused surface. Structure only: no behaviour change.

## Why

- `scripts/ratchet-limits.json:57` records 250 own-file-only and 346 test-only exports as baseline instead of removing them.

## Outcome

- The `export` keyword dropped, or the export tagged `@testSeam`, then the record lowered.

## Acceptance

- [ ] The recorded counts are lower than 250 and 346, and the check passes.
