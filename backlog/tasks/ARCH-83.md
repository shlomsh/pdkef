---
id: "ARCH-83"
title: "Every CI run reports how far affected-scope narrowed it"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-83 · Every CI run reports how far affected-scope narrowed it

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Tests and CI. Criterion: Guardrails and CI health. Structure only: no behaviour change.

## Why

- 11 of 12 recent non-docs main runs ran the full 548 to 557 chromium tests; only one ran 344. Pushes batch several commits and any shared-layer touch widens (`scripts/affected-scope.mjs` rule 4), so CI is fast because of sharding and the container, not narrowing.
- Nobody can see this without reading shard logs.

## Outcome

- The scope job writes narrowed vs full counts (projects, specs, unit files) and the reason for any widening to the job summary.

## Acceptance

- [x] Every CI run shows the narrowing summary; a docs-only run shows zero e2e.

## Progress (2026-10-27)

The scope-summary job writes narrowed and full counts (projects, specs, unit files) and the reason for any widening to the job summary; docs-only shows zero e2e (unit-tested). Open: confirm on the first real CI run after landing.

## Closed

Closed 2026-10-27. Seen on main: run 40537583054 (a code push) wrote the narrowing summary with its counts and widening reasons; run 40544865241 (a backlog-only push) reported verdict docs-only, 0 unit files, and skipped every e2e, build and unit job.
