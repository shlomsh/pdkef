---
id: "QUAL-42"
title: "CI builds once per run, not once per job"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
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

- [ ] Runner-minutes per run before and after, from five runs each, recorded in the ticket.
- [ ] No job's verdict differs from the single scope job's.
