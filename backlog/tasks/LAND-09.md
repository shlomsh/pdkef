---
id: "LAND-09"
title: "A test's time budget measures the test, not a cold start"
status: "done"
priority: "P3"
epic: "honest-tests"
depends_on: ["LAND-06"]
---

# LAND-09 · A test's time budget measures the test, not a cold start

*Filed 2026-11-27.* Two rules report work inside a test body that the 5 s budget then measures
(docs/landmines-adoption.md): `no-cold-import-in-test`, 52 dynamic `import()` calls in 27 files
(`PdfSignTool.test.tsx:905`, `acceptNegotiation.test.js:145`), and `no-cold-start-in-test`, 113 process or
runtime starts in 21 files (`dependencyDirections.test.js:19`, `generate-precache-manifest.test.mjs:101`,
`check-ratchet-raises.test.mjs:38`). On battery or under a busy CI runner a cold start is where a test runs
out of time with no bug (reference: tests slow on battery).

## Outcome

- First, a sample of 20 `no-cold-start-in-test` hits says how many are real spawns and how many are cheap
  helpers the rule over-reports; a real miss or false positive goes upstream, like PR 21 and PR 33.
- Imports hoist to the top of the file or a `beforeAll`; a fixture that must start fresh per test keeps a
  one-line disable naming why.
- Both rules at `error` in `.oxlintrc.json`, `npm run lint:landmines` clean.

## Status (2026-11-27)

Both rules are on at `error`; `npm run lint:landmines` is clean.

- Sample: every cold-start hit looked at was a real process start in a test body, none a cheap helper, so
  nothing went upstream.
- `no-cold-import-in-test`: 51 imports left the test body, to module scope or, in two files, a
  warm-up in a `beforeAll` (`useFormFieldRegions.states.test.tsx`, `IslandErrorBoundary.test.tsx`). One stays with a disable:
  `src/test/support/network.browser.test.ts`, where the module load passing through to Vite is the behaviour.
- `no-cold-start-in-test`: twelve guard scripts export `main(argv, io)` and run it only behind
  `isEntry(import.meta.url)` (`scripts/is-entry.mjs`, real paths, so a symlinked start such as macOS's `/var`
  still runs the guard instead of passing silently). Their tests call `main` in-process and keep one real CLI
  run in a `beforeAll`. `check-ratchet-raises`, `check-cited-paths` and `check-unused-exports` build their
  fixture repos once per describe. 23 starts stay, each with a disable naming why: `ci-bounded-apt` (8),
  `vitest-worker-watchdog` (5), `chunkInterfaceGuard` (6), `gitLastModified` (2), `check-push` and
  `check-fast` (1 each).
- `src/editor/dependencyDirections.test.js` moved to `scripts/check-editor-dependency-directions.fixtures.test.mjs`
  because it now imports the checker (module boundaries: `src/` never imports `scripts/`).
- `errors-read`'s `main` took the old top-level code, so its report printers moved to module scope to keep it
  under the size record.
- `scripts/test-double-reasons.mjs` holds a disable of either rule to one line with a reason.
