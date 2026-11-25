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
does not live in. It reported 13 tests at filing.

## Outcome

- The tests that were really misplaced move beside their subject.
- A test whose real subject is something the rule cannot see keeps its place, with a file-level
  `oxlint-disable landmines/colocated-tests -- <the subject>` line saying what it tests
  (Shlomi's call, 2026-11-19: a permanent exception, not an allow list, which upstream frames as an
  adoption list that shrinks).
- Upstream: a test that also imports production code outside `src` is cross-boundary and has no `src`
  owner. A failing rule test, then the fix, as a PR with Shlomi's OK.

## Status (2026-11-19)

- Moved (2): the Sign toolbar's comment-button test beside `ElementToolbar`, and the Highlight
  history-keys test, which only drives the shared hook, beside `useHistoryShortcuts`.
- Ten files carry a disable line, each naming its subject: four read from disk (localized routes, Scan guide
  photos, the Sign language page, the tool folder tree), three Sign corpus forms, the enhance worker (a real
  module Worker the rule cannot trace), and two waiting on upstream: `src/site-lib/reportContract.test.ts`
  (with `api/report.ts`) and `scripts/ratings-read.test.mjs` (with `scripts/ratings-read.mjs`).
- Upstream: https://github.com/interfere-inc/landmines/pull/33 (checks green when posted). This ticket waits for
  that colocated-tests fix; once it ships, those two lose their disable line.
- The three rules the adoption doc declines are off (`no-comments`,
  `no-explicit-return-types`, `test-file-names`), Shlomi's call, 2026-11-24.
