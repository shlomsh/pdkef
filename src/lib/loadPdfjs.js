import workerUrl from './pdfjsWorker.js?worker&url';
import { installPdfjsPolyfills } from './pdfjsPolyfills.js';

/**
 * Sets pdf.js up around an import the caller supplies. Callers use `getPdfjs()` below;
 * this stays exported for a test that passes the legacy build.
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

/** @type {Promise<typeof import('pdfjs-dist')> | undefined} */
let pdfjsPromise;

/**
 * The one pdf.js loader (ARCH-39): the only `import('pdfjs-dist')` in src/, memoized, so every
 * tool sets pdf.js up once. `vi.mock('pdfjs-dist')` reaches it because Vitest mocks by module id.
 * A failed import is not cached, so a retry can succeed.
 *
 * @returns {Promise<typeof import('pdfjs-dist')>}
 */
export async function getPdfjs() {
  pdfjsPromise ??= loadPdfjs(() => import('pdfjs-dist'));
  try {
    return await pdfjsPromise;
  } catch (error) {
    pdfjsPromise = undefined;
    throw error;
  }
}
