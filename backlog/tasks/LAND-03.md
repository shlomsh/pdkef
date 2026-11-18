---
id: "LAND-03"
title: "Raised test timeouts only shrink"
status: "done"
priority: "P3"
epic: "honest-tests"
depends_on: ["LAND-01"]
---

# LAND-03 · Raised test timeouts only shrink

*Filed 2026-11-18.* `no-flake-masking` found 25 raised per-test timeouts in 13 files
(docs/landmines-adoption.md). The ones opened are real heavy work (PDF exports, corpus runs), so the goal
is a count that cannot grow, not a rewrite.

## Outcome

- Upstream: `no-flake-masking` reports `src/tools/sign/lib/flatten.js:191`, production code, because a
  local function named `describe` is called with three arguments. A failing rule test (a non-test file,
  or `describe` not imported from vitest/Playwright), then the fix, as a PR with Shlomi's OK.
- pdkef enables `no-flake-masking` with an `allow` map of today's per-file counts, and
  `test:ratchet-raises` refuses a raised or added entry, so the map can only shrink. The flatten.js
  false positive sits in the map until the upstream fix ships; the rule then flags the entry as stale.

## Status (2026-11-18)

pdkef side landed: the rule is on with the allow map, and `test:ratchet-raises` guards it.

The upstream fix is ready: `docs/landmines/no-flake-masking-local-describe.patch` (`git am` onto
landmines `2536897`). It resolves the callee with scope analysis and skips the call only when the name
is plainly an ordinary function (a function declaration, a parameter, or a variable holding an arrow or
function expression). Fixture tests (`const test = base.extend(...)`, `import { test } from
"./fixtures"`) are still checked. Against pdkef it drops the flatten.js report and keeps the other 24
timeouts. Posted as https://github.com/interfere-inc/landmines/pull/21. Once it ships, the
flatten.js entry turns stale and is deleted with the landmines bump (LAND-02).
