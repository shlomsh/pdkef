---
id: "DEBT-42"
title: "pdf.js runs on browsers that lack the built-ins it calls"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# DEBT-42 · pdf.js runs on browsers that lack the built-ins it calls

*Filed 2026-10-08, from the daily error read.* Build 0e5d90f reported four Redact errors that are one
cause: pdfjs-dist 6.3.289 calls built-ins an older browser does not have.

| browser | reports | step | missing built-in (read from source) |
| --- | --- | --- | --- |
| Chromium 109 | 2 | load_document | `Iterator.prototype.join` (`pdf.mjs:797`, the DEBT-38 case) |
| Chromium 141 | 1 | render_page | `Map.prototype.getOrInsertComputed` (`pdf.mjs:16464`, via `PdfPageCanvas.tsx:60`) |
| Chromium 141 | 1 | read_glyphs | the same call (`pdf.mjs:15995`, via `readGlyphs.js:16`, `useObjectPreviews.ts:57`) |

Chromium 141 is above DEBT-38's floor of 122, so those visitors saw no notice and the tool failed.
That `getOrInsertComputed` first shipped around Chromium 145 is from memory and must be checked
against MDN browser-compat-data before anything is built on it.

## What to build

1. A small polyfill module in `src/lib/` for the built-ins pdf.js 6.3 uses (`Map.prototype.getOrInsert`,
   `getOrInsertComputed`, `WeakMap` equivalents, `Iterator.prototype.join`; confirm the full list by
   searching `node_modules/pdfjs-dist/build/pdf.mjs` and the worker for each), applied before pdf.js
   is first imported, in the main thread and in the worker bundle. Each is installed only when absent.
2. With the polyfills in, re-derive `src/lib/browserSupport.ts` floors from what still cannot run
   (`Iterator` itself cannot be polyfilled cheaply, so its floors may stay). Do not lower a floor
   without a browser that proves it.
3. Widen the DEBT-38 entry in `docs/error-known-items.json` so a failure of this kind on any tool
   matches, and add an entry for the `getOrInsertComputed` TypeError, per the tools-and-shell rule.

## Acceptance

- [ ] A unit test deletes each built-in, loads pdf.js, opens and renders a fixture, and was seen failing before the polyfill.
- [x] The polyfills are installed only when absent and never replace a native one (`src/lib/pdfjsPolyfills.test.js`, a native sentinel survives the install).
- [x] pdf.js worker is covered, not only the main thread (checked 2026-10-08 in Chromium 153 on a production build: every built-in deleted on the page and prepended to the worker, a PDF added on Compress; the wrapper worker ran clean, the unwrapped pdf.worker.min.mjs failed with "Iterator is not defined". An ad-hoc script, not a committed e2e).
- [ ] Floors in `browserSupport.ts` match MDN browser-compat-data for what remains unpolyfilled, with the check date.
- [x] The registry matches the three groups above (`scripts/errors-known.test.mjs`; DEBT-38 widened to any tool, new DEBT-42 entry, both `open` until a stamped build carries the fix).
- [x] Bundle weight stays inside `test:weight` (worst page 183463 of 400000 brotli, 2026-10-08; test:csp and test:lazy-modules also pass).
- [ ] Production: no report of this kind from a stamped build containing the fix, after a full UTC day.

## Not weighed

pdfjs-dist's legacy build (rejected in DEBT-38 for +22% main bundle) is the alternative to polyfills.
