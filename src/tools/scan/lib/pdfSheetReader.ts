// pdf.js behind pdfSheets' SheetReader. Reached only by a dynamic import, when a PDF arrives.
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { renderPageToCanvas } from '#lib/pdf/renderPage.js';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import { PDFJS_WASM_URL } from '#lib/pdf/pdfjsWasm.js';
import { toGray } from '#lib/pageEnhance/dewarp/index.ts';
import { readsRightToLeft, type SheetBorder, type SheetReader } from './pdfSheets.ts';

const JPEG_QUALITY = 0.92;

/** The page with its own /Rotate plus `extraTurns` quarter turns, drawn to `longEdge` pixels, as a canvas. */
async function draw(page: PDFPageProxy, longEdge: number, extraTurns: number, signal?: AbortSignal) {
  const rotation = (page.rotate + 90 * extraTurns) % 360;
  const unit = page.getViewport({ scale: 1, rotation });
  return renderPageToCanvas(page, { scale: longEdge / Math.max(unit.width, unit.height), rotation, signal });
}

/** `sheet` with its own tone around it; `sheet` itself when there is no border. Releases the canvas it replaces. */
/** The sheet shrunk to this many cells a side and spread back out: its paper tone, with no print left in it. */
const TONE_CELLS = 8;

/** Fill `context` with the sheet's own tone: pure white beside shaded paper would read as print to the Document look. */
function fillWithTone(context: CanvasRenderingContext2D, sheet: HTMLCanvasElement, width: number, height: number): void {
  const cells = document.createElement('canvas');
  cells.width = TONE_CELLS;
  cells.height = TONE_CELLS;
  const small = cells.getContext('2d')!;
  small.imageSmoothingQuality = 'high';
  small.drawImage(sheet, 0, 0, TONE_CELLS, TONE_CELLS);
  context.imageSmoothingQuality = 'high';
  context.drawImage(cells, 0, 0, width, height);
}

function withBorder(sheet: HTMLCanvasElement, { left, top, right, bottom }: SheetBorder): HTMLCanvasElement {
  if (left + top + right + bottom === 0) return sheet;
  const out = document.createElement('canvas');
  out.width = Math.round(sheet.width * (1 + left + right));
  out.height = Math.round(sheet.height * (1 + top + bottom));
  const context = out.getContext('2d')!;
  fillWithTone(context, sheet, out.width, out.height);
  context.drawImage(sheet, Math.round(sheet.width * left), Math.round(sheet.height * top));
  sheet.width = 0;
  return out;
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
      const text = items.map((item) => ('str' in item ? item.str : '')).join(' ');
      return text.trim() ? readsRightToLeft(text) : null;
    },
    async grayOf(pageNumber, longEdge, extraTurns) {
      const canvas = await draw(await doc.getPage(pageNumber), longEdge, extraTurns, signal);
      const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      return toGray({ width: image.width, height: image.height, data: image.data });
    },
    async jpegOf(pageNumber, longEdge, extraTurns, border) {
      const canvas = withBorder(await draw(await doc.getPage(pageNumber), longEdge, extraTurns, signal), border);
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
