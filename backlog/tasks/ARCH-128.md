---
id: "ARCH-128"
title: "The boundary rules are written once and checked against every copy"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-128 · The boundary rules are written once and checked against every copy

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding M4.
Area: Supporting. Criterion: Docs and guidance accuracy. Structure only: no behaviour change.

## Why

- The boundary rules are hand-copied into `CLAUDE.md` and the header of `scripts/check-module-boundaries.mjs`; only the doc is test-checked against the script.

## Outcome

- The doc test extended to the other copies, or the lists generated from the script.

## Acceptance

- [ ] Changing a rule in the script without the other copies fails CI.
