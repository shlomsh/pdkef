---
id: "DEBT-43"
title: "The export guards bundle loadPdfjs's ?worker&url import"
status: "done"
priority: "P1"
epic: "robustness"
depends_on: []
---

# DEBT-43 · The export guards bundle loadPdfjs's ?worker&url import

*Filed 2026-10-08.* The `export-guards` Playwright project is red on `main`: in CI on 914cb2dd and
locally through `npm run check:e2e`. Both `e2e/export/language-acceptance.spec.js` and
`e2e/export/export-render-guard.spec.js` die in `beforeAll`, before any case runs:

```
src/lib/loadPdfjs.js:1:7: ERROR: No matching export in "src/lib/pdfjsWorker.js?worker&url" for import "default"
```

DEBT-42 (9b8660ac, 7fcbfb1a) made every pdf.js caller set up through `loadPdfjs.js`, which imports the
polyfilled worker wrapper through Vite's `?worker&url` suffix. `buildSignBundle` in
`e2e/export/fixtures/exportRenderHarness.js` bundles the real `signPdf` with esbuild, which has no such
suffix. CI narrows `export-guards` by diff (`scripts/affected-scope.mjs`), so it only goes red on a diff
that reaches the export path, which is why some later `main` commits are still green.

A second break sits right behind the first: `findPdfWorkerUrl()` looks for
`dist/_astro/pdf.worker.min.*.mjs`, and since DEBT-42 the build emits only the wrapper,
`pdfjsWorker-<hash>.js`.

6ab0d46c (a parallel session) unblocked both with a plugin that stubs every `?worker&url` import to
`''` and leans on the specs setting `workerSrc` themselves. This ticket narrows that to the one import
and gives it the real worker URL, so `loadPdfjs` never sets an empty `workerSrc` in the bundle and a
future `?worker&url` import fails loudly instead of silently getting nothing.

## What to build

- An esbuild plugin in `buildSignBundle` that resolves `./pdfjsWorker.js?worker&url` to the built
  wrapper's same-origin URL, so the bundle loads the same polyfilled worker the page does.
- `findPdfWorkerUrl()` finds `pdfjsWorker-*.js`.
- Production loading and DEBT-42's worker polyfill are unchanged.

## Acceptance

- [x] The red run reproduced locally before the fix (language acceptance, the esbuild error above).
- [x] `PLAYWRIGHT_PORT=4398 npm run check:e2e` green for `export-guards` (the render guard skips off
  Linux by design; its CI run is the proof for it).

## Done

*Closed 2026-10-08.* CI run 37819792308 on 4ba9afd1 (ubuntu-24.04) ran `export-guards` in full: language
acceptance passed all 143 language/face combinations, and the render guard matched its baseline
across 39 cases.
