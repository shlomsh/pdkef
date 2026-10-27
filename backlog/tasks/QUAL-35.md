---
id: "QUAL-35"
title: "CI narrows a test-only push the way check:push does"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "next"
depends_on: []
---

# QUAL-35 · CI narrows a test-only push the way check:push does

*Filed 2026-10-28* from the CI and build-structure assessment of 2026-10-27: a replay of the scope verdict on 58 consecutive pushes to main, job timings from 24 CI runs (2026-10-26/27), and `check:fast`/`check:push` timed on typical diffs. Lane: [ARCH-123](ARCH-123.md).

## Why

- `narrowTestOnlyChange` lives only in `scripts/check-push.mjs:134`. CI resolves scope through
  `resolveScope` (`scripts/affected-scope.mjs:502`) and never applies it.
- 3 of 44 non-docs pushes in the replay changed only tests; each still ran 52 or more specs plus the
  export guards. Estimated saving 60 to 100 s of wall on those pushes (about 7%).

## Outcome

- The rule moves into `resolveScope` (or a step both share), so CI and `check:push` give the same
  verdict for a push whose every non-docs file is a test.

## Acceptance

- [ ] The existing `narrowTestOnlyChange` tests run against the shared function.
- [ ] A test asserting `check:push` and CI resolve the same scope for a test-only diff.
