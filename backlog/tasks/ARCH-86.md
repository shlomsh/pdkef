---
id: "ARCH-86"
title: "The unit suite runs as its own CI job beside the guards"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
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

- [x] Guards and units report separately; total wall time does not rise.

*Closed 2026-10-27:* run 40563223976 (a225e8fc) reports `checks` (36s) and `units` (281s) separately. Its 567s wall was set by `font-guards (1)` (533s), which ran because the push touched the font tables, as on 97f93bab (608s). `units` ended at +314s, level with the e2e shards (+299s), and the unit step itself (200s) sits inside the recent 128-207s range. The old combined `checks` job also ran the guards serially before the units, so the split takes about 30s off that path.
