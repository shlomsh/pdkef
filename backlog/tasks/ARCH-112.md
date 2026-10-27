---
id: "ARCH-112"
title: "A JS/TS clone-percentage ratchet runs in CI"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-112 · A JS/TS clone-percentage ratchet runs in CI

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding D6.
Area: Code. Criterion: Duplication. Structure only: no behaviour change.

## Why

- Only CSS duplication is measured in CI; no JS/TS clone check exists.

## Outcome

- A clone-percentage ratchet in `scripts/ratchet-limits.json`.

## Acceptance

- [ ] Raising the clone share fails CI; lowering it lowers the record.
