---
id: "QUAL-08"
title: "Measure ARCH-20 on a week of real commits: how often does CI actually narrow, and by how much"
status: "open"
priority: "P2"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-20"]
---

# QUAL-08 · The narrowing rate, measured on post-move commits

*Filed 2026-09-14; split from ARCH-20's production-measurement acceptance item.* ARCH-20's Nx
implementation is complete. This ticket owns only the post-landing evidence and the decisions that
depend on it (ARCH-21, QUAL-07 and DEBT-07).

## Problem

`scripts/nx-affected-histogram.mjs` on the last 200 commits says 47 docs-only, 10 narrow, 143
everything, but ~90% of that window predates the `src/tools/` layout, so a pre-move commit's paths
are unowned by today's projects and classify as `everything` for the wrong reason. The honest
expectation from the file-level ideal (ARCH-15: 34 single-tool and 34 site-only of 200) is that
roughly one commit in six narrows to a tool and one in six is page-only, which ARCH-20 still runs in
full. Whether that holds on real, post-move history is unknown.

## Scope

- After a week (or 40 non-docs commits on `main`, whichever comes first), for every CI run since
  `9b4f944`: read each job's "Affected scope" step summary (or the `affected-scope:` line in the
  log), and record: verdict (`everything` with its reason, or `narrowed to <projects>`), the
  `e2e` shards' test counts and step times, `checks`'s unit test time, whether `font-guards` ran,
  and the run's wall (`gh run view --json jobs,createdAt,updatedAt`). A small script under
  `scripts/` that prints this table from `gh run list` is fine and may stay.
- Report: share of runs in each bucket; median wall per bucket; the reasons behind `everything`
  (unowned config file, which core project, page-only). Compare with the pre-ARCH-20 medians in
  QUAL-05's notes (173s without fonts, 246s before sharding).
- Re-run `scripts/nx-affected-histogram.mjs --count 40` on the same window as a cross-check that the
  oracle and the runs agree.

## Acceptance

- The table and shares are recorded here, with a short result linked from ARCH-20's Notes.
- A recommendation, with the numbers behind it, on whether ARCH-21 (split `site`) is worth doing:
  if page-only commits are under one in ten, it is not.

## Current state

The sampling gate is no longer a reason to wait. As of 2026-09-15, `9b4f944..HEAD` contains 76
commits, 59 of them non-docs under `scripts/change-scope.mjs`'s production classification. That is
past the ticket's 40-non-doc-commit threshold. What remains is to collect the per-run Actions data,
summarize the buckets and timings, cross-check the same window locally, and make the ARCH-21
recommendation.
