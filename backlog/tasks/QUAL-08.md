---
id: "QUAL-08"
title: "Measure ARCH-20 on a week of real commits: how often does CI actually narrow, and by how much"
status: "done"
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
- A recommendation on DEBT-07, using the same narrowing-rate data: whether finishing the
  `SignMessages` edge (below) and flipping `editor` out of `CORE_PROJECTS` is worth doing, and
  whether Nx itself is worth its footprint (227 of 851 lock packages) given how often narrowing
  actually pays off.

## DEBT-07 input (2026-09-17)

Cutting the two edges DEBT-04's addendum named split into one real fix and one non-fix:

- `signLanguagePage.test.js`'s edge to `editor` is gone (nested as its own `seo-content-guards`
  project, the same shape as `cross-tool-tests`): `lib` and `site-test` both dropped out of
  `editor`'s affected set.
- `src/i18n/`'s edge to `editor` (the `SignMessages` type, re-exported by `toolMessages.ts`) did
  not narrow anything by giving `src/i18n/` its own Nx project. `i18n` is a hub every tool and the
  site itself legitimately import (module-boundaries rule 1), so `editor -> i18n -> {every tool,
  site}` still marks everything affected on any editor change - the same reach the old `site`
  fallback had, just now a named, real edge instead of an attribution artifact. The actual fix is
  to reverse it: define `SignMessages` in `src/i18n/` and have `editor/registry/messages.ts` import
  it from there. `editor -> site-i18n` is already an allowed direction (DEBT-10's carve-out), so
  this is a real cut, not another relabeling - just not attempted yet, pending this ticket's
  recommendation on whether the narrowing is worth finishing at all.

See `backlog/tasks/DEBT-07.md`'s "## Investigated (2026-09-17)" section for the full measurement.

## Current state

The sampling gate is no longer a reason to wait. As of 2026-09-15, `9b4f944..HEAD` contains 76
commits, 59 of them non-docs under `scripts/change-scope.mjs`'s production classification. That is
past the ticket's 40-non-doc-commit threshold. What remains is to collect the per-run Actions data,
summarize the buckets and timings, cross-check the same window locally, and make the ARCH-21
recommendation.

## Result (2026-09-18)

**Method.** `scripts/ci-narrowing-report.mjs` (new, not wired into CI - see its own header) reads
`gh run list` for every completed `ci.yml` run on `main` created on or after `9b4f944`
(2026-09-14T01:31), then per run: fetches the unsharded `checks` job's log and greps the
`affected-scope: <reason>` line affected-scope.mjs writes to stderr (checks, both `e2e` shards and
both `font-guards` shards each resolve the same diff independently right after their own `npm ci`,
so one log per run is enough); reads step-level start/complete timestamps already present in
`gh run view --json jobs` for the `checks` job's "Run tests" step and each `e2e` shard's Playwright
step (no extra call); greps each `e2e` shard's own log for Playwright's own `N passed` summary line;
and checks whether `font-guards`' "Run Playwright e2e tests (font guards...)" step is `skipped`
(its job always runs - only that step is gated on `fonts != 'false'`, see `ci.yml`). Every `gh api`
response is cached under `.ci-narrowing-cache/` (gitignored) so a re-run or a widened window is free
for what it already has.

**Window.** `9b4f944..HEAD` held 156 commits and 60 CI runs by 2026-09-18 (55 `push`, 5 `schedule`);
the table below is the 55 `push` runs, since a nightly `schedule` run answers a different question
(`nightly_unchanged`, not per-commit narrowing).

| verdict | n | share | median wall | median `checks` unit-test step |
| --- | --- | --- | --- | --- |
| `docs_only` (checks/build/e2e/font-guards all skipped) | 10 | 18% | 12s | n/a |
| `narrow`, a tool project | 12 | 22% | 161s | 22s |
| `narrow`, site/fonts only (page-only) | 1 | 2% | 120s | 6s |
| `everything` | 32 | 58% | 178s | 61s |

`everything`'s 32 break down: 12 (22% of all runs) `core project(s) affected` (site, editor, shell,
sometimes lib - a real cross-cutting change, or the `editor -> i18n -> {every tool, site}` reach the
DEBT-07 input above names); 14 (25%) `unowned files` under `scripts/` (test infra, fixtures, guard
scripts - the "root-project trap" `docs/nx-affected-ci.md` already names, not a real full-repo
change); 3 (5%) touched `.github/workflows/ci.yml` itself (correctly conservative); 2 (4%)
`package.json`/`package-lock.json`; 1 (2%) other root config.

Of the 12 narrow-to-tool runs: `tool-sign`/`tool-redact` (8 runs, mostly together - the editor's two
tools share `cross-tool-tests`), `tool-merge` (4). font-guards' Playwright step actually ran (i.e.
`fonts=true`) on 30/55 runs (55%); when it did not, median wall was 132s against 170s when it did -
a larger wall-clock delta (~38s) than narrowing to one tool bought (178s -> 161s, ~17s), because the
workflow's wall-clock is bounded by the slowest parallel job (font-guards was ARCH-20's own stated
long pole, 144-251s), not by summed test count - narrowing cuts the `checks` unit-test step by
roughly 3x (61s -> 22s) but that step is rarely the critical path once Playwright jobs are running
alongside it.

Overall median wall across all 55 runs: 167s, against QUAL-05's pre-ARCH-20 baseline of 173s without
fonts / 246s before sharding - a real but modest improvement, and one that comes more from
`font-guards` narrowing off (45% of runs) and the two-shard split than from tool-level `checks`/`e2e`
narrowing.

**Cross-check.** `node scripts/nx-affected-histogram.mjs --count 156` (the full window, not just the
40 the Scope asked for) against the same range: 41 docs_only (26%), 35 narrow (22%), 80 everything
(51%) of 156 commits. The per-commit oracle and the per-run reality agree closely on the narrow rate
(22% either way) and are in the same range on docs-only (26% vs 18% - pushes can bundle several
commits, one of which is non-docs, which the per-run number correctly reflects and the per-commit
number cannot); both are within the ARCH-15 "roughly one in six" expectation's ballpark, on the low
side for page-only specifically.

**ARCH-21 (split `site`): not worth doing.** Page-only narrows are 1/55 runs (2%), far under the "one
in ten" bar this ticket's own acceptance set. `src/pages/**`/content changes essentially never land
without a tool or shared-core file in the same push in this window.

**DEBT-07 (finish the `SignMessages` cut, drop `editor` from `CORE_PROJECTS`): worth finishing, but
its ceiling is small.** The `core project(s) affected` bucket is 12/55 runs (22%) - the entire
population this cut could move, and only the subset of those 12 where `editor` was the *only* core
project affected (via the `i18n` re-export) would actually flip to `narrow`; DEBT-07's own
"Investigated" section has the per-commit detail on how many of those are that specific edge versus
`shell`/`lib` genuinely changing too. Even a best-case flip of all 12 only trades a 178s-median
`everything` run for a ~161s-median `narrow` run - real, but the wall-clock case for DEBT-07 is
weaker than its architectural case (a real, named dependency direction instead of an attribution
artifact). Recommend finishing it on the architecture merits already stated in DEBT-07, not on a
wall-clock promise this data does not support.

**Is Nx worth its footprint?** Yes, keep it, but the highest-leverage remaining lever is not ARCH-21
or DEBT-07: 14/55 (25%) `everything` runs, the single largest reason after `core project(s)
affected`, are `unowned files` under `scripts/` - test infra, fixtures and guard scripts that no Nx
project claims, so any touch to them (which routine guard/test maintenance does often) forces a full
run regardless of how precise the tool boundaries are. That is a different, cheaper fix (give
`scripts/` or its test-relevant subfolders project ownership) than either ticket this one was asked
to judge; it is not itself in scope here, so it is left as an observation rather than a new
recommendation this ticket makes a call on.

Data and script: `scripts/ci-narrowing-report.mjs --since 9b4f944 --events push`. Raw cache not
committed (gitignored, regenerate with the same command).
