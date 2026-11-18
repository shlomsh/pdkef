---
id: "LAND-03"
title: "Raised test timeouts only shrink"
status: "open"
priority: "P3"
epic: "honest-tests"
horizon: "next"
order: 3
depends_on: ["LAND-01"]
needs: "Your OK to post the upstream issue or PR"
---

# LAND-03 · Raised test timeouts only shrink

*Filed 2026-11-18.* `no-flake-masking` found 25 raised per-test timeouts in 13 files
(docs/landmines-adoption.md). The ones opened are real heavy work (PDF exports, corpus runs), so the goal
is a count that cannot grow, not a rewrite.

## Outcome

- Upstream: `no-flake-masking` reports `src/tools/sign/lib/flatten.js:191`, production code, because a
  local function named `describe` is called with three arguments. A failing rule test (a non-test file,
  or `describe` not imported from vitest/Playwright), then the fix, as a PR with Shlomi's OK.
- pdkef enables `no-flake-masking` with an `allow` map of today's per-file counts.
