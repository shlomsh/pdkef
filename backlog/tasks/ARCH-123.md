---
id: "ARCH-123"
title: "The narrowed share of main runs is reported and acted on"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
depends_on: []
---

# ARCH-123 · The narrowed share of main runs is reported and acted on

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding G1.
Area: Tests and CI. Criterion: Guardrails and CI health. Structure only: no behaviour change.

## Why

- Narrowing is reported per run, but how often it narrows main pushes was not re-measured; full e2e still runs when the diff reaches shared code (`scripts/affected-scope.mjs`).

## Outcome

- A report of the narrowed share over the last N main runs, then a fix for the shared-code case it exposes.

## Acceptance

- [ ] The share is reported in the CI summary.
- [ ] A decision on the shared-code cases is recorded in the ticket.
