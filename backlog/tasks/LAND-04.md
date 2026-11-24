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
- Wave 5b, the browser files (2026-11-22): 13 files, down to 1,149. In real Chromium now: Sign's
  signature dialog (real `<dialog>`, canvas and font loading, 12 to 0), Save to Drive (a real tab from
  `window.open`, real IndexedDB, 17 to 6 forced), Scan's pipeline (real decode, canvas, EXIF and its page
  worker, JPEG tolerance of 2 per encode) and recent preview, the whiteout eyedropper (real painted
  canvases and layout), the enhance worker, the maintenance beacons, and two Sign export tests on fonts
  Vite really serves. Sign's main test file and `drawElements` wait for the pdf.js wave: their pdf.js
  tests keep the font-fetch helper, so splitting them now would only be undone. `arrived(n)` now fails
  at once when a request goes unanswered instead of waiting for the timeout. Several browser runs in
  one worktree at once can fail at import while Vite re-optimizes the shared dependency cache; one
  process, cold or warm, never did in 10 runs.
- Fresh review of wave 5 (2026-11-22), two reviewers with no shared context: no weakened assertion.
  Fixed: Scan's dying-worker test still faked image, canvas and object URLs in Node; it now runs in
  Chromium with only the worker forced, and checks the one worker-failure report through the real
  `/api/report` beacon (1,145). A helper-test listener now removes itself. Checked and kept: the
  `doUnmock` of the warp spy before the worker tests (without it the worker's jobs go unseen).
- Wave 6 set-up and pilot (2026-11-22): `browserToolHarness.ts`, the island harness for Chromium, with
  real IndexedDB and web storage emptied per test, error reports and usage events read from the real
  beacons, and nothing for pdf.js. The pdf.js codecs (same-origin `.wasm`) pass the network guard as
  Vite's own traffic. Split's island test runs on real pdf.js first (1,144): the encrypted fixtures
  answer the real probe, pages are built with pdf-lib, and downloads are read from a real click.
- Wave 6, the islands (2026-11-22): 13 files, down to 1,054. Compress, To Image, Merge, Security, Edit
  Pages, the shared page grid and Highlight's open path run in Chromium on real pdf.js; the
  `island` and `island-compress` projects and their worker and engine set-ups are gone, and
  `pdfjsEdges` keeps only the `pdfjs-dist` edge Redact and Highlight's other files still use. Found on
  the way: the page grid reported a thumbnail render it had cancelled itself when its file was removed
  (a late `/api/report` that made Edit Pages flaky); fixed with a test seen failing first. Vite now
  pre-bundles pdf-lib and the pdf.js worker, so a cold run no longer reloads mid-run and fails imports.
- Fresh review of wave 6 (2026-11-22), three reviewers with no shared context: no weakened test name.
  Fixed (1,049): exact savings, sizes and report lists where a looser check had crept in, Security's
  failures from a real unreadable file instead of a factory mock, Merge's wide layout from the real
  viewport, one forced failure where a test had removed IndexedDB, and waits on the run's own state
  instead of a leftover one. Clearing beacons during a flush no longer drops the wrong record. Kept as
  it is: Security's `isCurrent` check survives its mutation because the page also keeps a stale result
  off screen; defence in depth, not a gap.
- First Linux run of the branch (2026-11-22, run 45071364866): e2e, build and typecheck green; four
  red jobs, all fixed. Split's "Share appears as soon as the output is ready" bet on the build still
  running after the pick (on Linux it had finished; the build is now held open, one forced line),
  unit-scope and two guidance citations still named moved files, and `draftRestoreRace` failed in
  about half of shard 2 runs, before wave 6 too: a recents write from the previous test, still in
  flight when the next swapped in a fresh IndexedDB, pruned the draft the new test had seeded.
- Redact wave (2026-11-23): all seven Redact island files run in Chromium on
  `redactTool.browser.tsx`, down to 1,025. The export is held at `applyPageEdits` (one forced line)
  instead of at a pdf.js read; positions are exact from the whole pixels a MouseEvent carries
  (Chromium floors them). Nothing fakes pdf.js any more: `pdfjsEdges`, the `island-redact` project and
  `harness.pdfjs` are gone. Fresh review, two reviewers: fixed a 3-digit precision taken for product
  rounding (it was Chromium's 6-digit style serialisation), two dropped "never sampled" checks, a
  repeated keypress and a recorder poll used as waits, a refusal of every IndexedDB open, a missing
  settle after a drag, and unit-scope's Redact entries. A cold run caught Security's replacement
  tests reading the dialog before it reopened. Kept: Whiteout's `fullscreenEnabled` getter (iPhone
  Safari's missing element full screen) and export's no-Share platform state, both forced.
- Browser tests no longer resize the window (2026-11-23). Scan's "size limit" tests timed out locally and
  on Linux CI because a resize often left Chromium with no idle time for the rest of the run, and each
  canvas encode then took its 1s fallback: after Redact's `delete` file, 4 of 4 with its viewport reset
  and 0 of 4 without. Redact and Edit Pages' undo file now run in a Chromium instance that starts at
  1280x800 (`DESKTOP_BROWSER_TESTS` in `vitest.config.js`); Merge's widening test is a Playwright spec.
  Two full browser runs: 696 passed, Scan 2.7s.
  Linux confirmed it (run 45247238186): 696 passed, Scan's file 4.3s where it had been 83s with three failures.
- Scan wave (2026-11-23): Scan's doubles went from 120 to 36, the branch to 941. The island file is seven
  browser files on `scanTool.browser.tsx`, reading real photos drawn on a canvas and the real pipeline;
  camera tests run in a third Chromium instance with touch and Chromium's fake camera
  (`CAMERA_BROWSER_TESTS`); one resize test is a Playwright spec. The page worker, viewer, PDF hooks and
  `scanActions` run for real in Chromium; the Node files read real glyph pages instead of a forced
  `assess`. Fresh review, three reviewers: fixed a forced turn a real page
  gives, unpinned worker arguments, a failure forced only once, pieces no longer pinned, and four checks
  that could pass on nothing. A cold run also
  showed Split's "operation failed" event missing: the harness's `flush()` did not wait for the effect of a render
  made outside `act`; it does now (never under fake timers), and `restore()` turns reporting off before
  it waits. Each has a test that failed first. Kept, forced: a camera with zoom, no
  `OffscreenCanvas` or module worker, a camera refusal, `Viewfinder`'s live camera, corners view callbacks.
- Scan on Linux (run 45261132549): browser tests, units, typecheck and build green. `checks` failed on
  four guards Scan broke, all fixed: the size record, an unused export, `canUseCamera` untested (two
  one-line browser tests now), and `@ts-nocheck` (seven Scan files typed). `e2e (4)` failed on QUAL-56's
  known flake.
- Browser tests follow the test pyramid (Shlomi, 2026-11-23, for every tool and module 2026-11-24). The
  rule and its evidence are in `docs/landmines/no-test-doubles.md`, "The browser layer stays small". The
  Sign wave stops short of Chromium: the island suite and its doubles stay in jsdom, and Sign's hook and
  lib tests run real bytes there. Three new browser tests: the page colour around a whiteout, a rotated
  text's width, an oversized signature image. 914 doubles. Next: trim the island suites of the earlier
  waves tool by tool, Compress first, then a count limit in CI.
- Linux, run 45369168853: the browser job is green for the first time (898 passed). Two fixes: the
  `@ts-nocheck` record counted Compress's deleted files early, and `usePageToolSession.test.tsx` now waits
  for the hand-off read to release the page before it ends.
- Compress trimmed (2026-11-24): 137 browser tests down to 15 flows (29.7s to 8.7s); the branch's browser
  layer is 900 down to 778, 891 doubles. The island's logic is `useCompressTool` plus pure `lib/`
  modules with hook and component tests. A fresh review found lost assertions (the flatten hint, a skipped
  file, the photo set's strip, a failed share) and tests that passed only because jsdom fails; each
  is back with a mutation that fails it, or named as covered. Not guarded below: `autoBuild`, the cache
  scope constant, `openGate`'s prepare line.
- Merge trimmed (2026-11-24): 120 browser tests (Merge and the shared page-grid file) down to 12 in 5
  flows (13.5s to 5.3s); the branch's browser layer is 670, 885 doubles. The island is `useMergeTool` plus pure `mergeView`
  functions; its tests mount the real hook on real PDFs, fake-indexeddb and the real quiet policy. A fresh
  review found no behaviour change and one untested wire (the early warm of Download), now six tests;
  restore-before-hand-off is ordered by a real busy IndexedDB transaction. Kept in Chromium: rendered
  thumbnails, the locked single file, the opened page grid. One injected outcome stays in jsdom (`LOCK_PROBED`,
  forced: no pdf.js worker there); the real probe is in the browser flow.
- Merge, old tests against new (2026-11-24): the same 40 random product mutations through both suites (Merge's
  files plus shell and cross-tool; e2e not run). The old caught 22, the new 24; nothing the old caught is missed.
  16 slip past both.
- CI run 45382374105 is green on every job, the first on the branch; the browser step is 273s.
- Redact trimmed (2026-11-24): 137 browser tests in seven files down to 12 runs in one flows file; the branch's
  browser layer is 545. The island's editor is `useRedactEditor`, plus pure `drawnBox` and `initialRedactState`. A
  fresh review found the island-to-child wiring unguarded (repeat and unlink menus, toolbar, full screen, box count);
  `RedactEditor.test`, `RedactWorkspaceToolbar.test` and `useRedactFinish.test` drive the real controls, each proven
  by a one-line mutation. Four assertions moved into existing e2e specs, two more were added there. Doubles 885 to
  889: new ones are callbacks and matchMedia jsdom lacks. Not done: the 40-mutation old-against-new sample (skipped by
  the user's choice), and the comparison of the island's remaining prop mutations against the old suite (about 45
  survive the new one; of the six compared, five slip past the old one too and one needs a rerun).
- Found on the way: RED-75 (preview documents never freed on pdf.js 6.5), RED-76 (one very long line
  overflows the text preview).
