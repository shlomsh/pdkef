import type { PDFDocumentProxy } from 'pdfjs-dist';
import { renderPageToCanvas } from '#lib/pdf/renderPage.js';
import { findTextRows } from '#lib/pageLayout/textRows.ts';
import { turnsOf, type PageTurns } from '#editor/geometry/pageTurn.ts';
import { inkExtent, inkTextBounds, medianBounds } from '../lib/zoom/inkBounds.ts';

const SAMPLE_PAGES = 5;
const SAMPLE_WIDTH_PX = 800;

/**
 * Where the document's text sits left to right, in fractions of the page width, read from the rendered
 * pages themselves so a scan counts. The first few pages whose rows run across as shown (the file's own /Rotate plus the
 * person's `pageTurns` is none or a half turn) are sampled, then the canvas is released. A sideways page is skipped
 * because its text rows run vertically and the row finder reads horizontal ones.
 */
export async function readInkBounds(pdfDocument: PDFDocumentProxy, isLive: () => boolean, pageTurns: PageTurns = {}) {
  const perPage: Array<{ left: number; right: number } | null> = [];
  for (let n = 1; n <= Math.min(SAMPLE_PAGES, pdfDocument.numPages); n++) {
    const read = await readRows(pdfDocument, n, isLive, pageTurns);
    if (read === 'stale') return null;
    if (read === 'sideways') continue;
    const bounds = read ? inkTextBounds(read.rows, read.width) : null;
    perPage.push(bounds && turnsOf(pageTurns, n - 1) === 2 ? mirrored(bounds) : bounds);
  }
  return medianBounds(perPage);
}

/** The same span seen from the other side: rows read as shown on a page the person turned upside down come back to the unturned page's frame, which `turnedPageBox` turns again. */
const mirrored = ({ left, right }: { left: number; right: number }) => ({ left: 1 - right, right: 1 - left });

/**
 * One page's full text extent (every row counted, nothing trimmed), in fractions of its own width, for print.
 * Null for a sideways page, a page with no text, or a stale read.
 */
export async function readPageInk(pdfDocument: PDFDocumentProxy, pageIndex: number, isLive: () => boolean, pageTurns: PageTurns = {}) {
  const read = await readRows(pdfDocument, pageIndex + 1, isLive, pageTurns);
  return read === 'stale' || read === 'sideways' || !read ? null : inkExtent(read.rows, read.width);
}

/** Renders page `n` (1-based) and finds its text rows; the canvas is released before returning. */
async function readRows(pdfDocument: PDFDocumentProxy, n: number, isLive: () => boolean, pageTurns: PageTurns) {
  const page = await pdfDocument.getPage(n);
  if (!isLive()) return 'stale';
  const rotation = (page.rotate + 90 * turnsOf(pageTurns, n - 1)) % 360;
  if (rotation % 180 !== 0) return 'sideways';
  const canvas = await renderPageToCanvas(page, { scale: SAMPLE_WIDTH_PX / page.getViewport({ scale: 1, rotation }).width, rotation });
  const image = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
  const width = canvas.width;
  canvas.width = 0;
  return image ? { rows: findTextRows({ data: image.data, width, height: image.height }), width } : null;
}
