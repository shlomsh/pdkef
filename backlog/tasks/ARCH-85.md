---
id: "ARCH-85"
title: "Per-spec flake rates are recorded and read nightly"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "next"
order: 19
depends_on: []
---

# ARCH-85 · Per-spec flake rates are recorded and read nightly

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Tests and CI. Criterion: Guardrails and CI health. Structure only: no behaviour change.

## Why

- Of the last 100 main CI runs, 3 passed only on a second attempt and 3 more failed on e2e shards; nothing records which spec flaked, so a red run reads as noise.

## Outcome

- Playwright's JSON reporter output is kept per run; the nightly job aggregates failure and retry rates per spec and lists the top offenders in its summary.

## Acceptance

- [ ] The nightly summary names any spec with a failure rate above 2%.

## Progress (2026-10-27)

Playwright JSON reports upload per shard; the nightly flake-report job aggregates the last 30 main runs per spec and names any above 2% (aggregation unit-tested with planted 3% and 1% specs). Open: confirm on the first nightly after landing.
