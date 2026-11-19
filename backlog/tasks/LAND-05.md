---
id: "LAND-05"
title: "Tests live beside what they test"
status: "in_progress"
priority: "P3"
epic: "honest-tests"
horizon: "now"
depends_on: ["LAND-02"]
---

# LAND-05 · Tests live beside what they test

*Filed 2026-11-19.* `colocated-tests` (landmines) reports a test whose imports all sit in one folder it
does not live in. On branch `landmines-all` it reported 13 tests.

## Outcome

- The tests that were really misplaced move beside their subject.
- A test whose real subject is something the rule cannot see keeps its place, with a file-level
  `oxlint-disable landmines-structure/colocated-tests -- <the subject>` line saying what it tests
  (Shlomi's call, 2026-11-19: a permanent exception, not an allow list, which upstream frames as an
  adoption list that shrinks).
- Upstream: a test that also imports production code outside `src` is cross-boundary and has no `src`
  owner. A failing rule test, then the fix, as a PR with Shlomi's OK.

## Status (2026-11-19)

- Moved (2): the Sign toolbar's comment-button test beside `ElementToolbar`, and the Highlight
  history-keys test, which only drives the shared hook, beside `useHistoryShortcuts`.
- Disable line with its subject (9): files read from disk (localized routes, Scan guide photos, the
  Sign language page, the tool folder tree, three Sign corpus forms), the registry's signature entry
  reached through `drawElements`, and the island setup files that `vitest.config.js` loads.
- Waiting on upstream (2): `src/site-lib/reportContract.test.ts` (with `api/report.ts`) and
  `scripts/ratings-read.test.mjs` (with `scripts/ratings-read.mjs`). Posted as
  https://github.com/interfere-inc/landmines/pull/33 (upstream's checks green before posting). Once it
  ships, the rule stops reporting both, with no change here.
