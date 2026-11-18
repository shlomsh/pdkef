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

Wave 2 took the sleeps the rule cannot see, inside test helpers (`wait(ms)`, `flush()`, `settle()`):
41 more files, and 154 literal sleeps in test code became 12, each kept on purpose (two e2e waits under
`check-e2e-sleeps`, the watchdog's wall-clock tests, condition-wait ticks in `until`/`settle`/
`settleUntil`, simulated latency in a mock). About 60 mutation proofs across the "must not happen"
tests: one Merge test had lost its proof (its 25 ms thumbnail now landed before the merge started) and
was rewritten and proven; two page-grid tests passed alone with a wrongly opened dialog and now load the
dialog up front. Moving `waitUntil` and `drainPromises` to `src/test/support/` cleared a project cycle,
and `draftRestoreRace` now waits for its pending work in `afterEach`, which fixes CI's teardown flake.

A fresh review found nothing blocking; its follow-ups replaced the last fixed turn counts before
absence checks (Compress's stale analysis and call counting, Merge's late restore and stale draft write)
with signals, each proven. OpenWithChooser and chunkReload: 8 of 8 proven. Two absences cannot fail by
themselves: the locked single-file state's "That didn't work" (one file never builds) and the rail
Sortable re-creation, whose mutations fail only by timeout.

Found while proving, true before this work too (the old tests also pass with the guard removed): weak
tests in draft validation (`useEditorDraftPersistence`, its record has no bytes, so validation is never
reached), Redact previews (`useObjectPreviews`, an error is swallowed either way) and Compress's run
callbacks; and overlapping guards where removing one changes nothing (draft restore race, home-page
hand-off ordering, the replay trigger, Split's protected build, `useImageBatch` after unmount).

Left in this ticket: the watchdog's wall-clock tests (Shlomi's call), then landing, which waits for the
npm release with #19.
