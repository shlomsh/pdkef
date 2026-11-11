---
id: "QUAL-54"
title: "The unit jobs stop failing when the runner cannot reach Ubuntu's package servers"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# QUAL-54 · The unit jobs stop failing when the runner cannot reach Ubuntu's package servers

*Filed 2026-11-11*, asked by Shlomi after three main runs in a row lost their unit jobs to the same step.

## Why

`units (1)` and `units (2)` in `ci.yml` install `poppler-utils` with apt before the tests run (ci.yml's
"Install poppler-utils (pdftotext, for the W6 extraction guard)" step). On 2026-11-11 that step failed on
three consecutive pushes to main, so the unit suite did not run on CI at all for those commits:

| Run | Commit | Failed at the apt or system-dependency step |
| --- | --- | --- |
| 43039662485 | 39f299f2 | units (1), units (2), font-guards (1), font-guards (2), export-guards |
| 43043115858 | 151dab61 | units (1), units (2), export-guards |
| 43051442223 | 40e32ebc | units (1), units (2), export-guards |

The step already goes through `scripts/ci-bounded-apt.sh 120 300` (QUAL-33): two attempts, bounded at 120 s
and 300 s. Both attempts ran out (`attempt 2 of 2 failed (exit 124, bound 300s)`). The log of the first two
runs shows the runner could not resolve the host at all (`Temporary failure resolving
'security.ubuntu.com'`, and the mirror list fetch hanging before it), which is a different failure from the
slow mirror QUAL-33 was built for: a longer bound or a third attempt does not help when the name does not
resolve, and each failure already costs about 7 minutes. The third run failed the same way
(`Temporary failure resolving 'azure.archive.ubuntu.com'`, `'archive.ubuntu.com'`, `'security.ubuntu.com'`).
Three runs across one afternoon means it is not a passing blip.

The cost is that a red main stops meaning anything: MEM-33..36 and MEM-38 landed on runs that were red for
this reason, with the unit suite checked only locally.

The same script guards `npx playwright install-deps chromium` in font-guards and export-guards (ci.yml:908,
ci.yml:976), which failed the same way on the first two runs. The e2e jobs do not use apt: they run in
Playwright's own image (QUAL-29).

## What

Take apt off the path of the unit jobs, the way QUAL-29 did for e2e, so a package server that cannot be
reached cannot fail them. Options to weigh, cheapest first:

- Run the unit jobs in a container image that already has `pdftotext` (Playwright's image plus poppler, or a
  small image of our own), as the e2e jobs do.
- Cache the installed `poppler-utils` files between runs and install from the network only on a cache miss.
- Make the one guard that needs `pdftotext` (W6 extraction) its own job, so an install failure fails that
  job alone and the rest of the unit suite still runs and reports.

Then apply the same answer to the two `install-deps` steps in font-guards and export-guards.

Not the fix: raising the bounds or adding attempts in `ci-bounded-apt.sh`.

## Done when

- A unit job's result no longer depends on reaching an apt server during the run, shown by a run where the
  install source is unreachable or skipped and the unit suite still runs.
- font-guards and export-guards have the same property, or a note here says why they keep apt.
- The W6 extraction guard still runs on CI with a real `pdftotext`.

## What was done

- `units` (both shards): the apt step is replaced by an `actions/cache/restore` of the poppler-utils .debs
  (key: runner image + a manual `-v1`), a `dpkg -i` install, and an `actions/cache/save` after a fresh
  download. On a miss the download goes through `ci-bounded-apt.sh` with `--download-only`. The install step is
  `continue-on-error` and emits `ok`; when pdftotext is unavailable it prints a `::warning::` naming QUAL-54.
- With the apt servers unreachable and a cold cache, the unit jobs run: the W6 guard already self-skips its
  pdftotext half when `pdftotext` is not on PATH (the pdf.js half and every other test still run). That
  run loses only the pdftotext half of the W6 `/ActualText` extraction check.
- `font-guards` and `export-guards` keep apt: ci.yml documents that they must stay off the Playwright image
  (pixel thresholds measured against the runner's own fonts). Still open for this ticket's second "Done when".
- Unverified until a CI run: the cache key (`ImageOS`/`ImageVersion` env vars), the first miss populating the
  cache, a hit installing with `dpkg -i` (all dependencies in the cached set), and the skip path.
