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

*Filed 2026-09-14.* ARCH-20's own acceptance ("record the numbers before and after on a week of
runs") is the one part of it that a branch cannot deliver; this ticket is that measurement, so
ARCH-20 can close and the next decision (ARCH-21, QUAL-07) rests on data rather than the histogram.

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

- The table and the shares are in ARCH-20's Notes, and ARCH-20 is closed.
- A recommendation, with the numbers behind it, on whether ARCH-21 (split `site`) is worth doing:
  if page-only commits are under one in ten, it is not.
