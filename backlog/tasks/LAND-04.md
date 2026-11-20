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
- Seen while running it, on battery: the round's 27 files together time out in the first heavy test of
  Split, To Image, `pageGridTools` and `draftRestoreRace` (about 25 s each), while the start commit
  passed once. Alone, Split's old file failed 3 runs in 4 and the new one 1 in 4; To Image passed every
  run in both. Recheck plugged in before landing.
- Found on the way: RED-75 (preview documents never freed on pdf.js 6.5), RED-76 (one very long line
  overflows the text preview).
