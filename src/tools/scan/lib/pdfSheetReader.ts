// pdf.js behind pdfSheets' SheetReader. Reached only by a dynamic import, when a PDF arrives.
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { renderPageToCanvas } from '#lib/pdf/renderPage.js';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import { PDFJS_WASM_URL } from '#lib/pdf/pdfjsWasm.js';
import { toGray } from '#lib/pageEnhance/dewarp/index.ts';
import { readsRightToLeft, type SheetReader } from './pdfSheets.ts';

const JPEG_QUALITY = 0.92;

/** The page with its own /Rotate plus `extraTurns` quarter turns, drawn to `longEdge` pixels, as a canvas. */
async function draw(page: PDFPageProxy, longEdge: number, extraTurns: number, signal?: AbortSignal) {
  const rotation = (page.rotate + 90 * extraTurns) % 360;
  const unit = page.getViewport({ scale: 1, rotation });
  return renderPageToCanvas(page, { scale: longEdge / Math.max(unit.width, unit.height), rotation, signal });
}

const toJpeg = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The sheet could not be encoded'))), 'image/jpeg', JPEG_QUALITY);
});

/** Opens `pdf` with pdf.js. A protected file rejects here, with pdf.js's PasswordException. */
export async function openPdfSheetReader(pdf: File, signal?: AbortSignal): Promise<SheetReader> {
  const { getDocument } = await getPdfjs();
  const task = getDocument({ data: new Uint8Array(await pdf.arrayBuffer()), wasmUrl: PDFJS_WASM_URL });
  const doc: PDFDocumentProxy = await task.promise;
  return {
    pageCount: doc.numPages,
    async rightToLeft(pageNumber) {
      const { items } = await (await doc.getPage(pageNumber)).getTextContent();
      return readsRightToLeft(items.map((item) => ('str' in item ? item.str : '')).join(' '));
    },
    async grayOf(pageNumber, longEdge, extraTurns) {
      const canvas = await draw(await doc.getPage(pageNumber), longEdge, extraTurns, signal);
      const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      return toGray({ width: image.width, height: image.height, data: image.data });
    },
    async jpegOf(pageNumber, longEdge, extraTurns) {
      const canvas = await draw(await doc.getPage(pageNumber), longEdge, extraTurns, signal);
      const { width, height } = canvas;
      try {
        return { blob: await toJpeg(canvas), width, height };
      } finally {
        canvas.width = 0;
      }
    },
    close() {
      // expected: a document already gone has nothing left to release
      task.destroy().catch(() => {});
    },
  };
}
