---
id: "LAND-02"
title: "landmines sees a sleep inside act(), then guards our unit tests"
status: "in_progress"
priority: "P2"
epic: "honest-tests"
horizon: "now"
depends_on: ["LAND-01"]
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

## Progress (2026-11-18, branch `landmines-all`)

Work happens on `landmines-all`, which turns on every landmines rule and stays red until all are
handled (Shlomi's call: everything lands together). Measured with upstream main's build (2536897),
the rule reported 78 sleeps; 75 now await their signal (23 files), the other 3 are the watchdog's
wall-clock tests in `scripts/vitest-worker-watchdog.test.mjs`, which come to Shlomi by name.
18 mutation proofs: every rewritten "must not happen" test fails when its product guard is deleted,
and one Redact test that never could fail (it checked for Sign's message) now does.

Left in this ticket: sleeps the rule cannot see, inside test helpers (`wait(ms)`, `flush()`,
`settle()`, about 15 files); 154 literal sleeps in test code before, 74 after wave 1. Landing waits for
the npm release with #19.
