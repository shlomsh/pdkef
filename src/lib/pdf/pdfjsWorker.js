// The pdf.js worker, with the built-ins it calls filled in first (DEBT-42). Vite bundles
// this as its own same-origin worker asset (`?worker&url` in loadPdfjs.js), so the
// polyfills run in the worker's own realm, which a polyfill on the page cannot reach.
// pdf.js reads `Iterator` at load, so the polyfill import has to come first.
import './pdfjsPolyfillsFirst.js';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
