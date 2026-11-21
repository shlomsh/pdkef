# Removing test doubles (`no-test-doubles`, LAND-04)

Shlomi's call, 2026-11-19: bring the count down in waves, best value first, on branch `landmines-all`.
The rule stays off there until upstream takes a per-file `allow` option like its sibling testing
rules; that PR waits until our open ones (#21, #33) are resolved. The count left then goes in as an
allow list that only shrinks. 1,877 sites on 1,792 lines in 266 files at the start.

About 200 sites have no honest ending: tests that force a module to fail (146 lines) or force a
state such as storage that throws or a fixed id (59). They stay until the allow list, or a product
design that takes a failure honestly.

## What the rule checks

It is syntactic and takes no options. It reports:

- `vi.fn(impl)` (any argument but `undefined`), every `mock*` replacement method (`mockImplementation`,
  `mockReturnValue`, `mockResolvedValue`, `mockRejectedValue`, their `Once` forms, `withImplementation`),
  on any receiver.
- `vi.mock`/`vi.doMock` with a factory or without options, `vi.stubGlobal`. Allowed:
  `vi.mock(path, { spy: true })`, `vi.stubEnv`, fake timers, `vi.fn()`, `vi.spyOn` without an
  implementation.
- Writes to a fixed list of globals and native members (`navigator`, `matchMedia`, `localStorage`,
  `Worker`, `BroadcastChannel`, `crypto`, `fetch`, `document.visibilityState`, `Date.now`, prototypes of
  `FileReader` and the observers, and more), by assignment, `defineProperty`, `Object.assign`, `delete`.
- A canned `Response` from anything shaped like `fetch`. MSW handlers are the allowed way.

It does not look at callback props, injected parameters, test-local classes, or imports.

## The contract: a rewrite runs more real code

The rule is easy to satisfy without removing a double: `vi.fn(() => x)` becomes `() => x`, or a module
grows a parameter only so a test can pass a fake. That is the same double out of the rule's sight, and
does not count. Each replaced site must end in one of these, and the brief and the review name which:

1. **Real module.** The test runs the real implementation, with real IO where the environment gives it:
   `fake-indexeddb` for IndexedDB, real pdf-lib, real `pdfjs-dist/legacy` in Node.
2. **Spy-through.** The test only needs to see that a call happened: `vi.mock(path, { spy: true })` or
   `vi.spyOn(obj, 'm')` with no implementation, so the real code still runs. Await a signal, never poll
   the spy (LAND-01).
3. **Test input.** The value is the test's own input, not a replaced dependency: a callback prop such as
   `onChange` or `onTrace`, or the data a function under test receives. A plain function is right here,
   and it records what it needs. A collaborator that has a real implementation is not a test input.
4. **Network through MSW.** Anything that reaches `fetch` goes through an MSW handler
   (`onUnhandledRequest: 'error'`, which `strict-msw` then guards).
5. **Real browser.** An API jsdom does not have (`matchMedia`, `BroadcastChannel`, `Worker`, camera,
   canvas pixels, `navigator.*`) runs in Vitest browser mode against real Chromium, with no stub.

A site that fits none of these is reported to the lead, not bent to fit.

## Waves, best value first

1. Our own modules replaced with `vi.mock` (draft store, hand-off, page sampling, Drive modules, Scan
   pipeline): real module or spy-through. Most `mock*Value` calls on those mocks go with them.
2. Telemetry (`errorReport`, `productAnalytics`, `actionTrail` and the rest of `src/lib/telemetry`)
   in the tests that use it: the real modules run. A test that never looks at a telemetry export loses
   its mock outright; one that asserts calls keeps a spy-through; per-page state is reset per test
   (`resetUsageEventsForTests`, `resetActionTrailForTests`). Telemetry sends by `navigator.sendBeacon`,
   not `fetch`, and the real `reportError` stops at its production-only gate under test, so nothing
   leaves the test and MSW has nothing to catch here. Where the unit branches on what a send returned,
   that is one forced line, said to apply to every test. The telemetry modules' own tests stub
   `navigator.sendBeacon` itself: that is wave 5.
3. Callback props and inputs written as `vi.fn(impl)` / `mock*Value`: test input.
4. Network that goes through `fetch` (Drive, the KV store behind notes and ratings, the sample
   download): MSW, through `src/test/support/network.ts` (`answerNetwork()` once per file, `server.use`
   per test, `sentHeaders()` for the headers the code set). MSW 3 calls the option
   `onUnhandledFrame: 'error'`, and its default lets an unhandled request reach the real network; the
   support module also records unhandled requests and fails the test, because code that maps a failed
   fetch to "offline" would otherwise pass. A handler answers with bytes or strings, never a jsdom
   `Blob`, which arrives as the text "[object Blob]". The report endpoint is reached by beacon, and
   Sign's same-origin font fetches have no origin in Node: both belong to wave 5.
5. Browser APIs jsdom lacks: browser mode. First, a double for what the test's own environment
   already has goes where it is (Node's `BroadcastChannel`, webcrypto and object URLs, jsdom's clicks,
   a faked clock). What needs Chromium moves to `<subject>.browser.test.<ext>`, which only the `browser`
   project runs (headless Chromium, one file at a time, since the files share the page's storage);
   a split keeps every test name exactly once across the pair. Network there goes through
   `src/test/support/network.browser.ts`, the same contract as `network.ts`; a beacon lands after the
   call returns, so a test awaits `seen.arrived(n)`. Both refuse every unhandled request themselves:
   MSW's own "error" strategy lets any URL that looks like a static file through to the network. In the
   browser, Vite's module and static-file loads from the page's own origin pass through. Assert real
   values: literals where Chromium is deterministic, a stated tolerance only across a lossy stage.
6. pdf.js and rendering fakes in the island harness (`src/test/harness/pdfjsEdges.ts`): real pdf.js,
   in Node where it suffices, in browser mode where it renders.
7. The service worker tests (`scripts/sw.test.mjs`).

Each wave: a site list per file, small parallel briefs on disjoint files, and a fresh review that
checks each rewrite against the five endings.

- **Coverage holds.** A file keeps every test name it had. A test that forced a failure and can no
  longer is reported, not deleted or softened.
- **Proof.** Every rewritten "must not happen" test is mutation-proven: break the product guard in a
  scratch worktree, the test must fail with an assertion; if it does not, run the old test under the
  same mutation (old fails: lost coverage, fix it; old passes too: report as never caught).
- **Test input, operationally.** A value is the test's input when it crosses the unit's public
  boundary as a prop or argument that production callers also supply. Anything the unit imports, a
  method on an imported object, or a `deps = real` default production never overrides is not.
  Supplied is not enough on its own: a callback is input when it is a state setter or getter, a
  handler for something the person did, or a parameter the unit is generic over (several callers pass
  different functions, as seven tools pass `usePreparedOutput` its `build`; or the unit is a pure
  algorithm over it, like the size search over its encoder). When the one production caller always
  passes the same function of ours, or a thin wrapper of it (Scan's `onTrace` is always
  `traceCorners`, the swipe's `readerAt` always wraps `createSwipeReader`), it is a collaborator and
  stays a visible double. So does a plain function that re-implements real logic, such as a few
  lines of the editor reducer standing in for `dispatch`.
