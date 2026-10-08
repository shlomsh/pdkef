import { loadPdfjs } from '../../../lib/loadPdfjs.js';

/** @type {typeof import('pdfjs-dist') | undefined} */
let pdfjsLib;
export async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await loadPdfjs(() => import('pdfjs-dist'));
  }
  return pdfjsLib;
}
