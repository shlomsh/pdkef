---
paths:
  - "src/test/**"
  - "vitest.config.js"
  - "playwright.config.js"
  - "scripts/*.test.mjs"
  - "e2e/**"
  - "src/tools/*/e2e/**"
---

Loaded when working on shared test infrastructure (`src/test/`, the Vitest and Playwright configs, the
affected-scope scripts that narrow CI to what a change actually touches) and on any Playwright spec.
Each tool's own tests live under `src/tools/<tool>/` and load that tool's own rule too; this file is
about the environments and scope those tests run in, and what a browser assertion can rely on across
platforms, not their content.

How a run is narrowed to what a change touches (unit-by-impact, Nx scope, `check:fast`, `check:push`,
`gate:ios`) is `test-tooling.md`, loaded with those scripts.

## Fixes are test-first

A bug or a review finding starts as a failing test: reproduce it, run it and read the failure (it must
fail for the stated reason), then change the code until it passes. A subagent's brief for a fix orders
it the same way (test, red run, fix, green run) and asks for the red output in its report. Mutating the
fix to watch the test go red is a backstop, not the method. RED-53's reviews found tests that could not
fail (storage seeded before mount, a default compared with itself, a zoom fixed at 1), all written after
the fix.

Test seams (ARCH-61): an export that only tests import carries a `/** @testSeam */` JSDoc tag; untagged, `scripts/check-unused-exports.mjs` counts it as test-only against the ratchet.

## Tests await signals (`npm run lint:landmines`, LAND-*)

The open-source landmines Oxlint rules (`@interfere/landmines` 0.3.2, one plugin, rules named `landmines/...`)
run as they ship ([docs/landmines-adoption.md](../../docs/landmines-adoption.md)). `no-unsignaled-poll` is on:
never `vi.waitFor` / `expect.poll` on a spy or a recorder; resolve a deferred from the mock or listener, or
`page.waitForEvent` set up before the action. `no-flake-masking` and `no-fixed-sleep` are on with an `allow`
map in `.oxlintrc.json` (exact per-file counts): a new one fails, and `test:ratchet-raises` refuses any raised or
added entry. A rule that misses or misfires on our code is fixed upstream, never with a local guard. The one
file-level disable is `colocated-tests`, a line naming the test's subject. `no-test-doubles` is on: a double
that stays has its own `// oxlint-disable-next-line landmines/no-test-doubles -- Forced: <why>` line, checked by
`scripts/test-double-reasons.mjs`, which holds `no-parameter-branch`, `no-elapsed-time-bound` and `no-silent-catch`
(LAND-07) to one line with a reason too.

A `File` or `Blob` equals only itself in an assertion (`src/test/support/fileEquality.ts`, registered in `setup.js`); to check a copy, compare its name,
type, size or bytes.

No fixed sleeps (`no-fixed-sleep`, LAND-02; it counts Playwright `waitForTimeout` too). Wait for what the next assertion reads: `waitUntil` on the
DOM, or a deferred the mock resolves. A "must not happen" check first waits for the stale operation to
finish (a deferred in its mock), then `await drainPromises()` (`src/test/support/drainPromises.ts`)
inside the same `act`, because the stale result reaches the component a few promise hops later. Prove
such a rewrite by deleting the product guard: the test must fail. Example: DEBT-18 in
`src/tools/split/PdfSplitTool.load.test.tsx`. A product timer gets fake timers scoped to that one test.

Keep the browser layer small (test pyramid): a browser test is only for what Node and jsdom cannot show, on a narrow
subject, never a tool's whole island suite. Rule and evidence: `docs/landmines/no-test-doubles.md`. `check:fast` never
runs one; `check:push` runs those the diff reaches and CI runs them all.

A browser test never calls `page.viewport`: a resize can leave Chromium with no idle time, and every later canvas encode
takes 1s (LAND-04). A desktop-width file goes in `DESKTOP_BROWSER_TESTS` (`vitest.config.js`); one that needs touch or a camera is
named `*.camera.browser.test.*` (`CAMERA_BROWSER_TESTS`, Scan only); a test that must resize is a Playwright spec. Awaiting
a held step's `started` inside `act` deadlocks: `act` holds back the render that starts it.

## Test environments and E2E scope

Unit tests run under `node` (no jsdom) unless they match `DOM_TESTS` in `vitest.config.js`: any
`.test.tsx`/`.jsx` file anywhere (every tool under `src/tools/` included), what is left of the flat
`src/components/` (HeroDemo), `src/lib/{handoff,hooks,output}/use*` hook tests, `src/editor/workspace`, `src/lib/gestures`
(the gesture controller, moved out of `src/editor/` under DEBT-04 part 2 since `CompareSlider`, shell,
needed it too), and a short named list of `.test.js` files that decode images or drive pdf.js
(compress/compressImage/thumbnails/toImage in both their `src/lib/` and `src/tools/<tool>/` locations,
`src/tools/sign/hooks/useWorkspaceGestures.test.js`, `src/tools/redact/lib/redact.test.js`). Booting
jsdom cost more than the tests it hosted, so a pure-logic test in `src/lib`, `src/tools/<tool>/` or
`src/editor` pays nothing for a DOM it never touches; one that does need it goes in that list or
starts with `// @vitest-environment jsdom`.

Playwright is for what jsdom cannot prove; keep roughly one e2e per ten unit tests under
`src/tools/<tool>/e2e/`. A spec earns its place only by asserting something jsdom genuinely cannot -
a real tab close/reopen surviving through real browser storage, real layout or line-wrapping, a real
Fullscreen API element, drag-time pointer behaviour, a hydration/CSP flow - not by re-proving what a
unit test already proves under jsdom (DEBT-13); the 1:10 figure is a smell to notice when a tool's e2e
folder is growing, never a target to hit. `e2e/` itself now holds only the cross-tool specs, the font
screening guards under `e2e/sign/`, and the two export-pipeline guards under `e2e/export/` (ARCH-23).
A spec under `src/tools/<tool>/e2e/` may only visit that tool's own page; one that also visits another
tool's page belongs under `e2e/` instead, enforced statically by rule 7 in `docs/module-boundaries.md`
(`npm run test:module-boundaries`). `export-render-guard.spec.js` (`e2e/export/`) runs the real
`signPdf` in-browser and rasterises the PDF with pdf.js against per-case baselines: one rasteriser only
(poppler vs Chromium noise measured at 80-88%), and never "is there ink" as a pass condition, since
`.notdef` often draws more ink than the glyph it replaced.

Preact runs effects after paint, on a 35 ms timer raced against rAF. The jsdom setup cancels any such flush still pending when a
file ends (`src/test/support/afterPaintGuard.ts`, QUAL-58), so none fires after jsdom is gone; an assertion on an effect still
awaits the render inside `act`.

## A worker stuck in a loop (QUAL-52)

An endless render inside `act()`, or any loop that never yields, reaches no test timeout and cannot see its parent die.
`scripts/vitest-worker-watchdog.mjs`, preloaded through `execArgv` in `vitest.config.js`, runs on its own thread: it ends
the worker soon after the parent dies, and after 5 minutes without an event-loop turn, which fails the run and names the
file. So a mutation that makes a run hang is a finding, not something to wait out: kill the run and read the file named.

## Rendered text width is per-platform: assert layout properties, not pixels

UI labels use `--font-sans`, the system font stack, so the same label draws at a different width on
macOS (SF), CI's Linux (a fallback face), Windows (Segoe UI) and Android (Roboto). A pixel threshold
measured on a Mac says nothing about CI: on 2026-09-24 a clearance floor in
`src/tools/merge/e2e/merge-share.spec.js` turned `main` red three times in a row (6px, then 4px;
runs 36051842433 and 36053109356), because Merge's "Compress" had 7.4px of clearance at 320px on macOS
and 3.09px on CI. One of those runs also under-reported the problem: the assertion looped over the
buttons and stopped at the first failure, so the worst button's number never printed.

- Assert what holds for any font: a label stays inside its border (`> 0`), spare width is shared
  evenly (equal clearance within 1px), controls sit on one line. The Merge spec's
  `expectEveryLabelInsideItsBorder` / `expectSpareWidthSharedEvenly` are the model. Measure a label's
  extent with a `Range` against the border box on both sides; `scrollWidth` only reports the
  inline-end half of a centred label's overflow.
- Proxy Linux locally by forcing Arial, DejaVu Sans and Verdana on the element through
  `element.style.setProperty(..., 'important')` (the CSP blocks `page.addStyleTag`). Verdana at 320px
  came closest to CI's numbers. Docker is not installed on the dev machine.
- A spec whose number came only from macOS gets a Linux run before it reaches `main`: push its branch
  and `gh workflow run ci.yml --ref <branch>` (`ci.yml` runs automatically only on `main` and PRs).

## `src/test/support/`

The helpers other projects' tests import (`setup.js`, `astroContentStub.js`, `mockFileShare.js`,
`setInputFiles.js`, `pdfPageTreeFixtures.ts`, `until.js`, `fixtures/`) live in `src/test/support/`, the
Nx project `test-support`, which imports no src project. A helper that needs `lib`, `editor` or any
other project does not belong there. The repo-wide guards stay directly under `src/test/` (`site-test`).
That split keeps `lib -> site-test -> editor -> lib` from closing a loop.

Island tests mock only the storage and network edge, through `src/test/harness/toolHarness.ts`
(ARCH-78): fresh fake IndexedDB and storage per test, recorded beacons, created blobs, and the stored
draft read back through the real `draftStore`. It imports `lib`, so it lives in `site-test`, not
`test-support`. Nothing fakes pdf.js: an island test that needs it runs in the `browser` project on real pdf.js
through `src/test/harness/browserToolHarness.ts` (Redact's through `src/test/support/redactTool.browser.tsx`, Scan's through `scanTool.browser.tsx` beside it),
building its PDFs with pdf-lib or reading fixtures through `?url`. A state no real file can produce is one
`{ spy: true }` mock of our own module and one `mockImplementationOnce` line under its `-- Forced:` disable (LAND-04).

## `src/test/cross-tool/`

A test file may not launder a cross-tool import that a real edge in the same location would be
forbidden from making (rule 6 of `docs/module-boundaries.md`, DEBT-02): a test under `shell`,
`editor-ui`, `editor` or `lib`, or under one tool's own `src/tools/<name>/` folder, may not import
another tool's files. `src/test/cross-tool/` is the exemption: a test placed there classifies as
test-support, neither a core module nor a tool, so rule 6 never reaches it, and nothing imports from
it, so it can depend on tools without any project depending on it back. It holds tests that
deliberately span modules, such as `draftCheckingPlaceholder.test.tsx`/`draftRestoreRace.test.tsx`
(rendering `PdfSignTool` and `PdfRedactTool` together to test the shared draft-restore path) and
`textCoverage.test.js`/`languageAcceptance.test.js`. Rule 7 (also `docs/module-boundaries.md`) is the
companion rule for e2e specs: a `*.spec.js` under a tool's own `e2e/` folder may only reference that
tool's own routes, plus `/`; a spec that genuinely needs another tool's page lives under the top-level
`e2e/` instead. Read both rules' exact wording in `docs/module-boundaries.md` before adding a test that
touches more than one tool.
