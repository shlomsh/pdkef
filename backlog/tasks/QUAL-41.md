---
id: "QUAL-41"
title: "Every file a spec reads directly is covered by a scope rule"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "now"
depends_on: ["QUAL-34"]
---

# QUAL-41 · Every file a spec reads directly is covered by a scope rule

*Filed 2026-10-28* from the CI and build-structure assessment of 2026-10-27: a replay of the scope verdict on 58 consecutive pushes to main, job timings from 24 CI runs (2026-10-26/27), and `check:fast`/`check:push` timed on typical diffs. Lane: [ARCH-123](ARCH-123.md).

## Why

- Nx sees imports, not files a spec opens with `readFileSync` or `new URL(...)`. Today these are
  covered by failing open (an unknown file widens), not by a rule: `src/lib/__fixtures__/`,
  `public/images/redaction-guide/`, `public/sw.js`. Once QUAL-34 and QUAL-40 narrow those paths, a
  spec reading one of them could be skipped by mistake.

## Outcome

- A guard scans e2e and unit specs for direct file reads and fails when a target has no widen or
  owner rule that selects that spec.

## Acceptance

- [ ] The guard fails on a fixture spec that reads an uncovered file, and passes on the current tree.
- [ ] It runs in `check:fast` and CI.
