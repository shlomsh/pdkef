import workerUrl from './pdfjsWorker.js?worker&url';
import { installPdfjsPolyfills } from './pdfjsPolyfills.js';

/**
 * The one way to set pdf.js up. The caller keeps its own `import('pdfjs-dist')` and
 * passes it in as `importPdfjs`, so a test that mocks 'pdfjs-dist' still reaches its
 * mock from the caller's module (it does not from here).
 *
 * Installs the built-ins an older browser lacks before pdf.js is first imported (it
 * calls some at load, DEBT-42), and points pdf.js at the bundled worker, which installs
 * them in its own realm (pdfjsWorker.js). Both are same-origin, never a CDN.
 *
 * @param {() => Promise<typeof import('pdfjs-dist')>} importPdfjs
 * @returns {Promise<typeof import('pdfjs-dist')>}
 */
export async function loadPdfjs(importPdfjs) {
  installPdfjsPolyfills();
  const pdfjsLib = await importPdfjs();
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjsLib;
}
