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

- [x] A unit test deletes each built-in that opening and rendering a fixture reaches, loads a fresh pdf.js, opens and renders it on a real canvas, and fails without the polyfill (`src/lib/pdfjsPolyfills.pdfjs.test.js`, 2026-10-08). Six are reached: the global `Iterator`, `Map.getOrInsertComputed`, `Promise.try`, `Promise.withResolvers` and `Uint8Array.toHex` throw an error naming themselves; without `transferToFixedLength` the render never finishes. Each control deletes only its own built-in (Node 24 lacks `toHex` natively, which first made 12 of 15 controls fail on `toHex` whatever they deleted). With the polyfill made a no-op all six polyfilled runs went red. pdf.js calls the other eleven only on other paths; the test names them and `pdfjsPolyfills.test.js` covers each on its own.
- [x] The polyfills are installed only when absent and never replace a native one (`src/lib/pdfjsPolyfills.test.js`, a native sentinel survives the install).
- [x] pdf.js worker is covered, not only the main thread (checked 2026-10-08 in Chromium 153 on a production build: every built-in deleted on the page and prepended to the worker, a PDF added on Compress; the wrapper worker ran clean, the unwrapped pdf.worker.min.mjs failed with "Iterator is not defined". An ad-hoc script, not a committed e2e).
- [x] Floors in `browserSupport.ts` match MDN browser-compat-data for what remains unpolyfilled, with the check date (BCD 8.1.5, 2026-10-08). The check found five more unguarded built-ins, now polyfilled with unit tests seen red first: `Promise.withResolvers` (Chrome 119, Firefox 121, Safari 17.4), `ArrayBuffer.prototype.transferToFixedLength` (114, 122, 17.4), `URL.parse` (126, 126, 18), `Response.prototype.bytes` (132, 128, 18; the JBIG2/JPX wasm fetch) and `Blob.prototype.bytes` (144, 128, 18; the worker's `convertToBlob` JPEG path). Chrome/Edge 122-143 were let in without the last two, so those image paths likely failed there (read from code). Read from the code, the unguarded calls left are `AbortSignal.any` and `Set.prototype.intersection`, in pdf.js's viewer and editor classes, which the app does not load, and the `for await` stream read in `getTextContent()`, which production never calls (`pdfTextItems.ts` drains with a reader); the rest is syntax (Vite's default target, Chrome/Edge 111, Firefox 114, Safari 16.4), below every floor. So the floors stay: none is lowered without a browser that proves it.
- [x] The registry matches the three groups above (`scripts/errors-known.test.mjs`; DEBT-38 widened to any tool, new DEBT-42 entry, both `open` until a stamped build carries the fix).
- [x] Bundle weight stays inside `test:weight` (worst page 183463 of 400000 brotli, 2026-10-08; test:csp and test:lazy-modules also pass).
- [ ] Production: no report of this kind from a stamped build containing the fix, after a full UTC day.

## Not weighed

pdfjs-dist's legacy build (rejected in DEBT-38 for +22% main bundle) is the alternative to polyfills.
