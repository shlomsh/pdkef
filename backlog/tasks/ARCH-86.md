---
id: "ARCH-86"
title: "The unit suite runs as its own CI job beside the guards"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "now"
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

- `vitest run` moves to its own `units` job. On a dependency PR, one `dependency-gate` job builds first and the jobs that build on their own wait for it (a bump that breaks the build failed seven jobs in run 40337702161). `needs` is static, so waiting on `checks` would have slowed every run.

## Acceptance

- [ ] Guards and units report separately; total wall time does not rise.

*2026-10-27:* landed on `audit-structure`. It stays in progress until the first CI run on `main` shows that total wall time did not rise.
