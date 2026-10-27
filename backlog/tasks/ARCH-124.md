---
id: "ARCH-124"
title: "check-ratchet-raises is tested for a direct push to main"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-124 · check-ratchet-raises is tested for a direct push to main

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding G5.
Area: Tests and CI. Criterion: Guardrails and CI health. Structure only: no behaviour change.

## Why

- `scripts/check-ratchet-raises.mjs:12` falls back to the merge base with `origin/main`, which on a direct push to main may compare HEAD with itself (inferred, not run).

## Outcome

- A test of the push-to-main case with the previous tip as base.

## Acceptance

- [ ] A planted raised limit on a direct push to main fails the check.
