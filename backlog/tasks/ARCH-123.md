---
id: "ARCH-123"
title: "The narrowed share of main runs is reported and acted on"
status: "in_progress"
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

## Measured 2026-10-27

The scope verdict replayed on 58 consecutive pushes to main: 14 docs-only (24%), 30 everything (52%),
12 narrowed (21%), 1 nothing. 24 of the 30 wide pushes also ran the 25 font guards. The window is
skewed by CI-maintenance work (10 of the wide pushes touched `ci.yml`). The fixes this exposed are
QUAL-32 to QUAL-42; QUAL-34 is the shared-code and unowned-file case. The CI summary report is still
to do.

