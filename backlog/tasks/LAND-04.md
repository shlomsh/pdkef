---
id: "LAND-04"
title: "Fewer replaced dependencies in unit tests"
status: "open"
priority: "P3"
epic: "honest-tests"
horizon: "later"
depends_on: ["LAND-02"]
---

# LAND-04 · Fewer replaced dependencies in unit tests

*Filed 2026-11-18.* `no-test-doubles` reports 1,864 sites in 266 files (`vi.fn` 481, `vi.mock` 220,
`vi.stubGlobal` 178, `vi.spyOn` 166, `vi.mocked` 119; docs/landmines-adoption.md). Mocking side channels
(`errorReport` 33, `productAnalytics` 13) is reasonable; mocking `draftStore` or `pageSampling` usually
tests the mock, not the behaviour.

## Outcome

- Upstream: the rule accepts the same per-file `allow` map as `no-fixed-sleep`, so a codebase can adopt
  it as a count that only shrinks. Issue first, then a PR, each with Shlomi's OK.
- pdkef enables it with today's counts, and the first files to come down are the ones mocking our own
  pure modules.
