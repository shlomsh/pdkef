import type { PDFDocumentProxy } from 'pdfjs-dist';
import { renderPageToCanvas } from '#lib/pdf/renderPage.js';
import { findTextRows } from '#lib/pageLayout/textRows.ts';
import { turnsOf, type PageTurns } from '#editor/geometry/pageTurn.ts';
import { inkTextBounds, medianBounds } from '../lib/zoom/inkBounds.ts';

const SAMPLE_PAGES = 5;
const SAMPLE_WIDTH_PX = 800;

/**
 * Where the document's text sits left to right, in fractions of the page width, read from the rendered
 * pages themselves so a scan counts. The first few pages that read upright as shown (the file's own /Rotate plus the
 * person's `pageTurns` is a full turn or none) are sampled, then the canvas is released. A sideways page is skipped
 * because its text rows run vertically and the row finder reads horizontal ones.
 */
export async function readInkBounds(pdfDocument: PDFDocumentProxy, isLive: () => boolean, pageTurns: PageTurns = {}) {
  const perPage: Array<{ left: number; right: number } | null> = [];
  for (let n = 1; n <= Math.min(SAMPLE_PAGES, pdfDocument.numPages); n++) {
    const page = await pdfDocument.getPage(n);
    if (!isLive()) return null;
    const rotation = (page.rotate + 90 * turnsOf(pageTurns, n - 1)) % 360;
    if (rotation !== 0) continue;
    const canvas = await renderPageToCanvas(page, { scale: SAMPLE_WIDTH_PX / page.getViewport({ scale: 1, rotation }).width, rotation });
    const context = canvas.getContext('2d');
    const image = context?.getImageData(0, 0, canvas.width, canvas.height);
    const width = canvas.width;
    canvas.width = 0;
    perPage.push(image ? inkTextBounds(findTextRows({ data: image.data, width, height: image.height }), width) : null);
  }
  return medianBounds(perPage);
}
