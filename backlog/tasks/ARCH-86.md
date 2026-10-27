---
id: "ARCH-86"
title: "The unit suite runs as its own CI job beside the guards"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
order: 17
depends_on: []
---

# ARCH-86 · The unit suite runs as its own CI job beside the guards

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Tests and CI. Criterion: Guardrails and CI health. Structure only: no behaviour change.

## Why

- The `checks` job runs 18 guards and the whole unit suite serially (`.github/workflows/ci.yml:78-194`, about 3 to 5 minutes), so one slow step delays every verdict.
- A failing dependency PR also cascades into 11 red jobs (run 40337702161).

## Outcome

- `vitest run` moves to its own job; build-dependent jobs wait on `checks` for dependency PRs.

## Acceptance

- [ ] Guards and units report separately; total wall time does not rise.
