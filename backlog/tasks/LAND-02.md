---
id: "LAND-02"
title: "landmines sees a sleep inside act(), then guards our unit tests"
status: "blocked"
priority: "P2"
epic: "honest-tests"
depends_on: ["LAND-01"]
waiting_on: "A landmines release with interfere-inc/landmines#19 (release PR #20)"
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

- pdkef bumps landmines to the release with the fix, enables `no-fixed-sleep` with an `allow` map of
  the per-file counts it then reports, and decides whether `check-e2e-sleeps` stays (landmines does not
  count Playwright `waitForTimeout`).
- Zero-millisecond flushes (61 at filing) are judged separately: some are the only way to let a
  microtask chain settle.

## Status (2026-11-18)

The maintainers answered issue https://github.com/interfere-inc/landmines/issues/11 with their own fix,
https://github.com/interfere-inc/landmines/pull/19, merged the same day. They chose the known list:
the rule climbs through callbacks passed to `act`, `waitFor`, `then`, `catch`, `finally` and `step`,
and a `runNow` option replaces the list. Awaited registrations such as `page.route` handlers stay
unreported. Our local patch for the other design is dropped. Waiting for it to reach npm (0.1.0 is
the latest; release PR #20 is open).
