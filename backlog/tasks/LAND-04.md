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
- Fresh review of wave 3 (2026-11-20), three reviewers who had to quote the production line behind
  every removed double: no weakened assertions; three single-caller callbacks (Scan's `onTrace`,
  `processed`, `restorePages`) were collaborators by the contract's sharpened rule and went back.
  The rule is now in the contract. 1,319 to 1,331.
- Wave 4 set-up (2026-11-20): MSW 3.0.4 as a dev dependency (14-day cooldown), the shared server in
  `src/test/support/network.ts`, and the Drive client test on it as the pilot (a stray header and a
  changed query both fail it; a missing handler fails it). MSW brings `@types/node`, so TypeScript now
  knows Node's APIs everywhere: an oxlint guard (`no-restricted-imports` for `node:*`,
  `no-restricted-globals` for `Buffer`, `process` and the rest) keeps them out of browser code, with
  build helpers, corpus tooling, scripts, spikes and tests exempt, and 31 `@ts-expect-error` lines that
  only existed for the missing types are gone. `strict-msw` does not know MSW 3's `onUnhandledFrame`:
  one exact-count allow entry until the upstream fix.
- Wave 4, network through `fetch` (2026-11-20): 9 files, down to 1,291. Drive upload and open, the
  build's notes and rating reads, the report endpoint, the Markdown twin in middleware and the bundled
  sample now make their real requests, answered by MSW per test; every assertion reads the recorded
  request (full URL, exact headers, body, count). One shared `answerInTurn` answers requests in order and
  fails a test on one more than it answered. Kept for later waves: Google's sign-in and Picker scripts,
  `@vercel/functions`, navigator and performance stubs.
- Fresh review of wave 4 (2026-11-20), a contract reviewer and an independent code reviewer: no
  weakened assertion. Fixed: `sentHeaders` dropped an `Accept` the code set (now only at fetch's
  default), and `middleware.ts` still shadowed `process` instead of being exempt from the Node guard.
- Wave 5a, what Node and jsdom already have (2026-11-21): 14 files, down to 1,210. A survey of every
  browser-API double found about 90 that need no browser: the report endpoint's store calls (35, a
  wave 4 miss) now go through MSW in Node, and Node's own `BroadcastChannel`, webcrypto, object URLs
  and `navigator.onLine`, jsdom's own anchor and input clicks, and a faked `Date`/`performance` clock
  replace their stand-ins. A new test proves the error cap holds for the rest of the day (removing it
  passed every test before). 44 forced lines gained their `// forced:` comment.
- Wave 5b set-up (2026-11-21): Vitest browser mode (`@vitest/browser-playwright` 5.0.5, the repo's one
  Playwright), the `browser` project for `*.browser.test.*` files, its own CI job `units-browser` in
  Playwright's image (the two `units` shards skip it; `check-unit-shards` counts all three), and
  `network.browser.ts`. Found on the way: MSW's "error" strategy let an unhandled request to a
  file-looking URL reach the network in Node too; both helpers now refuse it (a test against a local
  server proves it). Sign's "Tab lands on the printed field" test raced the shell's draft check under
  load: it now waits for the file input.
- Wave 5b pilot (2026-11-21): 2 files, down to 1,193. `frameGrab` runs in Chromium against a real
  video stream (6 doubles to 0; exact crop rectangles read through a pass-through `drawImage` spy, a
  small tolerance only on pixels that went through the stream). `errorReport`'s sending describes
  (21 tests) moved to a browser file where real beacons and fetches are answered by the MSW worker;
  5 forced lines stay (offline, and a refused or throwing beacon). Two worktrees sharing one
  `node_modules` ran browser mode side by side four times, cold cache included, without a collision.
- Found on the way: RED-75 (preview documents never freed on pdf.js 6.5), RED-76 (one very long line
  overflows the text preview).
