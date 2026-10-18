---
id: "QUAL-23"
title: "Four chromium e2e shards, and the hero first-screen spec runs per test"
status: "done"
priority: "P2"
epic: "robustness"
---

# QUAL-23 · Four chromium e2e shards

*Filed 2026-10-18* from a review of recent CI runs. The two `e2e` shards are the critical path of
every full CI run, about 5-6 minutes against 1 minute for `build` and 3-4 for `checks`.

## Why

`fullyParallel: false` makes Playwright shard by spec file, in path order, so every `e2e/**` spec
lands in shard 1 and every `src/tools/*/e2e/**` spec in shard 2. On run 39124382451 (full suite):

| shard | tests | summed test time | job |
| --- | --- | --- | --- |
| 1 | 243 | 355s | 310s |
| 2 | 229 | 567s | 361s |

Shard 2 carries the tool editors (Redact, Sign zoom, saved-work restore, Compress KPIs), the heavier
and more timing-sensitive half. Shard 1's floor is one file, `e2e/tool-hero-first-screen.spec.js`, at
135s, which file-level sharding can never split across workers.

The repository is public, so extra runner minutes cost nothing; each shard's fixed cost (checkout,
`npm ci`, build, browser install) is about 45-60s.

## Scope

- `ci.yml`'s `e2e` matrix goes from `[1, 2]` to `[1, 2, 3, 4]`.
- `e2e/tool-hero-first-screen.spec.js` declares `test.describe.configure({ mode: 'parallel' })`: its
  tests share no module state, so Playwright schedules them one at a time across workers and shards.

## Done when

- A full CI run shows all four shards green, and the slowest `e2e` shard is measured against the
  355s/567s baseline above, with the numbers recorded here.

## Result

Two full-suite runs on the branch (workflow_dispatch, no narrowing), 2026-10-18:

| run | e2e shards (job wall) | whole run |
| --- | --- | --- |
| 39141112058 | 164 / 172 / 193 / 153s | 268s |
| 39141500514 | 161 / 149 / 159 / 213s | 225s |

Against 298-310s and 337-361s for the two shards on main's last full runs, and 330-360s for the
whole run. The hero spec's tests now spread over both workers of their shard.
Run 39141112058's one red was `tool-hero-first-screen.spec.js` "hand-off arrival ... compress-image
... no layout shift" (CLS 0.0127 against 0.01); the same test failed on main in run 38812242018
before this change, so it is an existing flake, not one this introduced.
