---
id: "QUAL-42"
title: "CI builds once per run, not once per job"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# QUAL-42 · CI builds once per run, not once per job

*Filed 2026-10-28* from the CI and build-structure assessment of 2026-10-27: a replay of the scope verdict on 58 consecutive pushes to main, job timings from 24 CI runs (2026-10-26/27), and `check:fast`/`check:push` timed on typical diffs. Lane: [ARCH-123](ARCH-123.md).

## Why

- Each run spends about 10 runner-minutes on checkout, `npm ci`, container start and build, whatever
  its verdict, with about 9 builds and 9 `affected-scope` calls per run, for 24 to 40 runner-minutes in
  all. This costs runner minutes rather than wall time.

## Outcome

- One job builds `dist/` and resolves scope once; the others download the build and the scope as
  artifacts, and the e2e matrix is sized by the number of specs in scope.

## Acceptance

- [x] Runner-minutes per run before and after, from five runs each, recorded in the ticket.
- [x] No job's verdict differs from the single scope job's.

## Progress (2026-10-28)

- New `plan` job: checkout (full history, the site build dates pages from git), `npm ci`, one
  `affected-scope.mjs` run, `scripts/e2e-shard-count.mjs`, one build, `dist/` uploaded (hidden files included, for
  `.well-known`). `build` (guards), `e2e`, `e2e-webkit`, `font-guards` and `export-guards` download `dist` and read
  scope from `plan`'s job outputs instead of artifacts, which holds the same data. A job with nothing to run is skipped
  at the job level and no longer pays checkout, `npm ci` and the container first. The chromium matrix is sized by the
  spec files in scope (1 to 4 shards, 8 files each, a guess to tune). `dependency-gate` is gone: `plan`'s build is
  that gate. `scripts/ci-single-build.test.mjs` pins it: one build, one scope call, every consumer needs `plan`.
- A `ci.yml` edit inside `plan` now turns the font guards on, as an edit inside `font-guards` does (they consume
  `plan`'s build), found by the reviewer. The `dist` upload overwrites on a re-run and is kept 3 days.
- Verdicts cannot differ: only `plan` runs `affected-scope.mjs`. `scope-summary` still runs its own `npm ci` and
  `scope-summary.mjs` (reporting only, left alone).
- Before, from the last wide runs: 31 to 38 runner-minutes, 286 to 343 s wall, 7 to 9 builds
  (40731441511: 37.9 min, 40731088174: 34.4, 40726898541: 31.7, 40724286548: 34.4, 40716281658: 31.3); the last
  narrowed run, 40736175265: 16.6 min.
- After, five runs of 2026-11-25: 37.7, 37.1, 37.3, 37.0 and 27.0 runner-minutes (45607925164, 45609749444, 45619504308,
  45621050714, 45623382967). One build per run instead of 7 to 9, but no fewer minutes, most likely because the browser tests LAND-04
  added and the extra shards of QUAL-57 took what the single build saved. Wall time is 216 to 307 s, 474 s on a run with a re-run job.
