---
id: "LAND-06"
title: "The landmines rules with nothing to fix are on"
status: "done"
priority: "P3"
epic: "honest-tests"
depends_on: ["LAND-04"]
---

# LAND-06 · The landmines rules with nothing to fix are on

*Filed 2026-11-27.* The first trial (2026-11-18) ran `@interfere/landmines` 0.1.0, which had 10 rules. 0.3.2 has 34.
Of the 24 rules never decided, nine had no hits over `src scripts e2e api middleware.ts`.

## Outcome

- `@interfere/landmines` is at ^0.3.2, and `npm run lint:landmines` is clean on it.
- Seven of the nine are on at `error`: `no-shared-signal`, `no-stale-render-assertion`, `no-styling-class-assertion`,
  `no-clipboard-read-text`, `no-imported-mutation`, `no-self-container-query`, `no-github-scripts`.
- `declared-test-inputs` is off: it is for Turbo monorepos, and pdkef runs Nx.
- `no-project-max-workers` is off. Under the whole lint scope it reports `vitest.config.js`'s browser project
  `maxWorkers: 3`, but Vitest 5.1 applies a project's `maxWorkers`: `groupSpecs` carries
  `spec.project.config.maxWorkers` to `pool.setMaxWorkers`, and the browser projects resolve to 3 while the root is 9.
  Upstream already has it: https://github.com/interfere-inc/landmines/issues/59.
- The 15 rules with hits get their verdicts and tickets from LAND-07 on, in `docs/landmines-adoption.md`.
