---
id: "LAND-01"
title: "Tests await a signal, not a poll on a spy"
status: "done"
priority: "P2"
epic: "honest-tests"
depends_on: []
---

# LAND-01 · Tests await a signal, not a poll on a spy

*Filed 2026-11-18.* First step of the landmines adoption (docs/landmines-adoption.md), the best return:
22 sites, each a poll on a spy or recorder against a deadline. This removes deadline polls on spies and
keeps new ones out; it is not a fix for a flake that was seen. The one measured gain: `vi.waitFor` gave up
after 1 s, a signal waits for the 5 s test timeout.

## Outcome

- `oxlint` and `@interfere/landmines` are devDependencies; `.oxlintrc.json` enables only
  `landmines-testing/no-unsignaled-poll` at `error`, with Oxlint's built-in categories off.
- `npm run lint:landmines` runs in `check:fast`, `check:push` and `ci.yml`, and passes.
- The 22 sites await a signal instead: a `Promise.withResolvers()` deferred resolved from the mock or
  recorder, the operation's own promise, or (Playwright) `page.waitForEvent` with a predicate. A bare
  Playwright await sits in a `test.step` that names what it waits for, so a timeout says which signal
  never came.
- The two `events()` polls in `useSaveToDrive.test.tsx` that the rule's single syntactic shape misses
  are converted the same way.

## Independent review (2026-11-18)

A fresh review session found no hang, false pass or race in the rewrites, and the five unit files passed
under 90 busy loops before and after. Cost: about 1.3 s of lint and 19 MB installed. Known loss: a unit
test whose awaited call never happens now fails as a bare 5 s timeout instead of "expected spy to be
called". Same-shape polls behind a helper (`events()`, `PdfSignTool.test.tsx:299`,
`shellPageGrid.test.tsx:226,239`) are a gap in the rule, to raise upstream rather than hand-hunt.

## Sites at filing

| File | Sites |
| --- | --- |
| `src/tools/sign/PdfSignTool.test.tsx` | 7 |
| `src/shell/pageWorkspace/useSaveToDrive.test.tsx` | 7 |
| `src/tools/highlight/components/PrintSheets.test.tsx` | 2 |
| `src/tools/scan/lib/camera/cameraStream.test.ts` | 1 |
| `src/editor/workspace/loadPdf.test.ts` | 1 |
| `src/tools/scan/e2e/lazy-chunk-skew.spec.js` | 1 |
| `src/tools/redact/e2e/redact-video.spec.js` | 1 |
| `src/tools/compress/e2e/batch-images.spec.js` | 1 |
| `e2e/offline/app-update.spec.js` | 1 |
