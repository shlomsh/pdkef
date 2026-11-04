// Reads a few pages of the file as it arrived and says whether it is a crooked scan (PE-06). Only pages that
// are one picture of a sheet are rendered; a born-digital file renders nothing at all.
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { renderPageToCanvas } from '#lib/pdf/renderPage.js';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import { toGray } from '#lib/pageEnhance/dewarp/index.ts';
import type { Assessment } from '#lib/pageEnhance/plan.ts';
import type { GrayImage } from '#lib/pageEnhance/quad.ts';
import { openAssessor, WorkerLostError, type Assessor } from './assessor.ts';
import { imageCover, MIN_IMAGE_COVER, samplePages, scanVerdict, type ScanVerdict } from './scanCheck.ts';

/** What assess is tuned for: a sheet shrunk to about this many pixels on its long edge. */
const READ_LONG_EDGE_PX = 1000;

type OpsTable = Record<string, number>;

/** Whether the page is one picture of the whole sheet, judged from what it paints. */
async function isSheetImage(page: PDFPageProxy, OPS: OpsTable): Promise<boolean> {
  const { width, height, viewBox } = page.getViewport({ scale: 1, rotation: 0 });
  const ops = await page.getOperatorList();
  return imageCover(ops, width, height, OPS, { x: viewBox[0], y: viewBox[1] }) >= MIN_IMAGE_COVER;
}

/** The page as it arrived (its own /Rotate, never the person's turns) as gray pixels, the canvas released. */
async function grayOf(page: PDFPageProxy, signal?: AbortSignal): Promise<GrayImage | null> {
  const rotation = page.rotate;
  const unit = page.getViewport({ scale: 1, rotation });
  const canvas = await renderPageToCanvas(page, { scale: READ_LONG_EDGE_PX / Math.max(unit.width, unit.height), rotation, signal });
  const image = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  return image ? toGray({ width: image.width, height: image.height, data: image.data }) : null;
}

/** One sheet's assessment; a worker that dies holding the pixels gets the page read again, on the main thread. */
async function assessSheet(page: PDFPageProxy, assessor: Assessor, signal?: AbortSignal): Promise<Assessment | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const gray = await grayOf(page, signal);
    if (!gray) return null;
    try {
      return await assessor.assess(gray);
    } catch (error) {
      // expected: a lost worker means this page is read again, on the main thread; anything else is the caller's to report
      if (!(error instanceof WorkerLostError)) throw error;
    }
  }
  return null;
}

/**
 * The verdict for the file, one page at a time. 'straight' when the sampled pages are not mostly pictures of
 * sheets; null when the caller is no longer live. Throws what a page throws, for the caller to report.
 */
export async function readScan(pdfDocument: PDFDocumentProxy, isLive: () => boolean, signal?: AbortSignal): Promise<ScanVerdict | null> {
  const { OPS } = await getPdfjs();
  const wanted = samplePages(pdfDocument.numPages);
  const sheets: Assessment[] = [];
  let assessor: Assessor | null = null;
  try {
    for (const n of wanted) {
      const page = await pdfDocument.getPage(n);
      if (!isLive() || signal?.aborted) return null;
      if (!(await isSheetImage(page, OPS as OpsTable))) continue;
      assessor ??= openAssessor();
      const sheet = await assessSheet(page, assessor, signal);
      if (!isLive() || signal?.aborted) return null;
      if (sheet) sheets.push(sheet);
    }
  } finally {
    assessor?.close();
  }
  // A file with few picture pages is a report with figures, not a scan.
  return sheets.length * 2 < wanted.length ? 'straight' : scanVerdict(sheets);
}
