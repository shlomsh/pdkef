---
id: "LAND-04"
title: "Fewer replaced dependencies in unit tests"
status: "in_progress"
priority: "P3"
epic: "honest-tests"
horizon: "now"
depends_on: ["LAND-02"]
---

# LAND-04 · Fewer replaced dependencies in unit tests

*Filed 2026-11-18.* `no-test-doubles` reports 1,864 sites in 266 files (`vi.fn` 481, `vi.mock` 220,
`vi.stubGlobal` 178, `vi.spyOn` 166, `vi.mocked` 119; docs/landmines-adoption.md). Mocking side channels
(`errorReport` 33, `productAnalytics` 13) is reasonable; mocking `draftStore` or `pageSampling` usually
tests the mock, not the behaviour.

## Outcome

Shlomi's call, 2026-11-19: the count comes down in waves, best value first, by the rules in
docs/landmines/no-test-doubles.md (a rewrite must run more real code; a syntax-only change does not
count). The rule is off on `landmines-all` meanwhile.

- Waves land on `landmines-all`, our own modules replaced with `vi.mock` first.
- Upstream: the rule accepts the same per-file `allow` map as `no-fixed-sleep`. Opened only after our
  PRs #21 and #33 are resolved, with Shlomi's OK.
- pdkef then turns the rule on with the count left as an allow list that only shrinks.
