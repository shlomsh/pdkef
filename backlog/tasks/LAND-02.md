---
id: "LAND-02"
title: "landmines sees a sleep inside act(), then guards our unit tests"
status: "blocked"
priority: "P2"
epic: "honest-tests"
depends_on: ["LAND-01"]
waiting_on: "Maintainers' answer on interfere-inc/landmines#11"
---

# LAND-02 · landmines sees a sleep inside act(), then guards our unit tests

*Filed 2026-11-18.* `no-fixed-sleep` found 8 of about 80 non-zero sleeps in our unit tests
(docs/landmines-adoption.md).

## Why it misses them

In `@interfere/landmines@0.1.0`, `inTestBody` walks up to the nearest enclosing function and accepts
the sleep only when that function is an argument of `it`/`test`/a hook. pdkef's common shape is
`await act(async () => { release(); await new Promise((r) => setTimeout(r, 50)); })`, where the nearest
function is `act`'s callback, so the sleep is invisible. The rule also drops every sleep in a file that
calls `vi.useFakeTimers()` anywhere, even in another `describe`.

## Outcome

- Upstream PR to `interfere-inc/landmines`: a failing rule test for a sleep nested in a callback inside
  a test body (and inside a helper called from it, if the maintainers want that), then the fix. Posted
  only with Shlomi's OK.
- Once released, pdkef bumps landmines, enables `no-fixed-sleep` with an `allow` map of today's
  per-file counts, and decides whether `check-e2e-sleeps` stays (landmines does not count Playwright
  `waitForTimeout`).
- Zero-millisecond flushes (61 at filing) are judged separately: some are the only way to let a
  microtask chain settle.

## Status (2026-11-18)

Issue first, not a PR: https://github.com/interfere-inc/landmines/issues/11. It asks which design the
maintainers want: climb through any awaited or returned call (implemented locally, catches all 79,
but reports awaited registrations like `await page.route(url, async (r) => { await sleep() })`), or
climb only through a configurable list of run-now callees (`act`, `waitFor`, `then`). The patch
(`docs/landmines/no-fixed-sleep-nested-callbacks.patch`, `git am` onto landmines `92084b1`) is ready
to become a PR on their answer. A fresh review found the false positives above and judged the
PR not ready without that decision.
