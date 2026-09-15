/**
 * Same-origin location of pdf.js's WASM codecs (JBIG2, OpenJPEG/JPX, the
 * qcms ICC color-profile lookup, QuickJS), synced from
 * `node_modules/pdfjs-dist/wasm/` into `public/pdfjs-dist-wasm/` by
 * `scripts/sync-pdfjs-wasm.mjs` (runs on `npm install`, see package.json's
 * `postinstall`).
 *
 * pdf.js 6.x moved CCITT fax and JBIG2 decoding off pure JS onto this WASM
 * module (`JBig2CCITTFaxImage`, `pdf.worker.mjs`). With no `wasmUrl`, a
 * scanned or faxed PDF's bilevel images fail to decode and pdf.js drops
 * them from the page entirely - silently, with no error surfaced to the
 * user, the page just renders as if those images were never there. Every
 * `getDocument()` call in src/ must pass `wasmUrl: PDFJS_WASM_URL`.
 *
 * pdf.js requires this to end in a slash (it builds each asset URL as
 * `${wasmUrl}${filename}`, e.g. `jbig2.wasm`, and rejects a bare prefix).
 *
 * `pdfjsWasm.test.js` fails if any `getDocument(` call site omits it.
 */
export const PDFJS_WASM_URL = '/pdfjs-dist-wasm/';
