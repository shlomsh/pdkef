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

## Status

- Pilots (2026-11-19): `settleHandoff` on the real draft store, `IslandErrorBoundary` spy-through.
- Wave 1, round 1 (Redact, Scan; 2026-11-19): 1,877 sites down to 1,719 on the branch. Every test
  name kept; 40-odd mutation proofs. Kept as forced lines, for the browser-mode wave: the ring sampler
  (page pixels), camera modules, the Scan pipeline's canvas steps, sheet rendering, and pdf.js's
  worker loader (the legacy build stands in). `useScanView`'s turning failure stays forced: the real
  `turnImage` fails in jsdom only because jsdom cannot decode, not by design.
- Wave 1, round 2 (Highlight, Compress, Merge, Sign, shell, page workspace; 2026-11-20): down to
  1,618. Kept forced, for the browser-mode wave: canvas pixels (ink, scan verdicts, thumbnails, image
  decode) and pdf.js's worker loader. `readScan`'s fake pdf.js page and document stay visible
  `vi.fn` doubles for the pdf.js wave. Sign's hand-off check now has its own test: a file that could
  not be parked reports nothing. With the real swipe gesture, a mark in progress at 1x now owns the
  finger (the old mock hid it).
- Seen while running it: `readScan` and Sign's MOBI-07 test time out on a cold run and pass warm,
  the same at the round's start commit (battery power, and a vitest cache shared by the symlinked
  proof worktrees).
- Wave 1, round 3 (editor, drafts and hand-off, site-lib, cross-tool, Split, To Image, Image to PDF;
  2026-11-20): down to 1,479. The draft store, hand-off, Drive sign-in, PDF loading and the sketch strokes
  run for real; Drive's network stays for the MSW wave. Image to PDF went from 15 to 20: its hidden build
  gate is now five visible forced lines. Never caught, before or after: `useDraftPersistence` dropping
  `isCancelled()` (it only fires on unmount), and Split's guard before the load in DEBT-18.
- The round 3 timeouts were the Mac in maintenance sleep (lid closed on battery), not the rewrites:
  awake, the round's 27 files pass together in about 6 s, twice.
- Fresh review of wave 1 (2026-11-20), three rounds by reviewers with no shared context: about 35
  findings, fixed in one round, each loss proved by mutation first. Restored or closed: PrintSheets'
  render counts, the swipe's dispatch order, Highlight's outline wait, the scan-offer and Scan draft
  races, PDF loading's stale-success guard, the draft-restore "loaded once" and arrival-mark checks,
  the hand-off's save-before-navigate hold, page-edit progress scaling, stored hand-off bytes, the
  damaged-PDF error, Drive's arriving state; literals in place of self-checking expectations; a
  forced thumbnail state that leaked across tests; spy polls replaced by state or real promises.
  Never caught before or after, now caught: drawing the wrong scan page, an unreadable preview page,
  Highlight's open outline. Scan's "could not open" test had passed only because the shipped pdf.js
  loader fails in tests; it now fails on the bytes. 1,479 to 1,488: the added sites are visible
  forced lines that replaced hidden ones.
- Wave 2, telemetry in the tests that use it (2026-11-20): 47 files, down to 1,420. Error reports,
  usage events, the action trail, maintenance events and the analytics sink run for real everywhere
  outside the telemetry modules' own tests: 16 silencers deleted, the rest spy-through with module
  state reset per test, each asserted call proved by deleting it (46 mutations). The only forced
  lines are a send's result where the screen depends on it (the rating prompt and modal, rating
  reports). Sign export and Save to Drive no longer use an analytics mock as their "done" signal: they
  wait for the served download and the failed state. The telemetry modules' own browser stubs
  (`sendBeacon`, `location`, performance entries) stay for the browser-mode wave.
- Fresh review of wave 2 (2026-11-20), seven reviewers with no shared context: one coverage loss
  (Save to Drive's second failure report, restored and proved by mutation), per-page state reset in two
  more files, two forced comments sharpened, two redundant forced lines dropped. 1,420 to 1,418.
- Wave 3, callback props and inputs (2026-11-20): 22 files, down to 1,319. A callback became a plain
  function (or a bare `vi.fn()`) only where a production caller supplies it from its own state or the
  person's action, or where the unit is generic over it (the size search, the draft scheduler, the
  gesture controller, once-until-failed): each with the caller quoted and a mutation proof. Kept
  flagged as collaborators, because production passes one of our own modules: the service worker
  report's `send`, `usePdfShare`'s share object, the swipe reader and its bands, the whiteout page
  colour sampler, the editor reducer's `dispatch`, Compress's machine. Test-only seams stay flagged
  too (`compressImages`' `encodeImage`, `chunkReload`'s deps).
- Found on the way: RED-75 (preview documents never freed on pdf.js 6.5), RED-76 (one very long line
  overflows the text preview).
