// Scan's DOM side, loaded with one import() once the first photo is in, so the page's
// first load carries none of the warp, filter or edge code (docs/scan-to-pdf.md).
// A new photo's inspection and a page's processing run in the page worker (SCAN-21), and here, on
// the main thread, where the browser cannot run them there; everything else is canvas plumbing
// around the pure modules beside it.
import { fitScanToBudget, type FitResult } from './scanBudget.ts';
import { canvasToBlob } from '#lib/images/canvasBlob.js';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { throwIfAborted } from '#lib/output/abort.js';
import { imagesToPdf } from '#lib/images/imagesToPdf.js';
import { placeImage } from '#lib/images/imagePage.js';
import { MAX_SEARCH_MS } from '#lib/images/targetSizeSearch.js';
import type { ScanFilter } from './filters.ts';
import type { Quad } from './quad.ts';
import { NO_WORKER, offThread } from './pageWork/offThread.ts';
import type { PageJob, PageJobResult } from './pageWork/protocol.ts';
import {
  OUTPUT_LONG_EDGE, drawCapped, guessWith, inspectWith, processWith,
  type CanvasKit, type InspectedPhoto, type ProcessedPage, type ProcessedWithReport,
} from './pageWork/steps.ts';

export type { InspectedPhoto, ProcessedPage } from './pageWork/steps.ts';
export type PageSize = 'fit' | 'a4' | 'letter';
/** placeImage's shape: PDF points, y from the page's bottom. */
export interface Placement { pageWidth: number; pageHeight: number; x: number; y: number; width: number; height: number }
/** One page of the built PDF: the very JPEG inside it, and where it sits on its paper. */
export interface BuiltPage { blob: Blob; place: Placement }

// An <img> rather than createImageBitmap: drawImage then honours the EXIF orientation the
// same way the corner editor's <img> shows it, on every browser, so the corners line up.
// (The page worker uses createImageBitmap only once it has shown it does the same.)
async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const freeCanvas = (canvas: HTMLCanvasElement) => {
  canvas.width = 0;
  canvas.height = 0;
};

/** The main thread's canvases: <img> decodes and <canvas> elements. */
const pageKit: CanvasKit = {
  surface(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    return { canvas, ctx, toBlob: (type, quality) => canvasToBlob(canvas, type, quality), free: () => freeCanvas(canvas) };
  },
  async decode(blob) {
    const img = await loadImage(blob);
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  },
};

/** The job in the page worker, or here where there is none. A job that failed in the worker runs here
 * too: when it succeeds here, the worker's failure was the worker's and is reported; when it fails here
 * as well, that error is the caller's to handle, as it was before the worker. */
async function offThreadOr<J extends PageJob>(job: J, here: () => Promise<PageJobResult<J>>): Promise<PageJobResult<J>> {
  let workerError: unknown = null;
  try {
    const done = await offThread(job);
    if (done !== NO_WORKER) return done;
  } catch (err) {
    // expected: run here below; reported after that only when it succeeds here, where the worker did not
    workerError = err;
  }
  const done = await here();
  if (workerError) reportError('pdf_tool_run', workerError, 'scan_page_worker');
  return done;
}

/** The page's corners as the edge guess sees them, or null when it finds no page. Where the photo was
 * inspected (worker or here), so its pixels are decoded and shrunk exactly as they were for its first
 * corners. */
export function guessPage(photo: Blob): Promise<Quad | null> {
  return offThreadOr({ kind: 'guess', image: photo }, () => guessWith(pageKit, photo));
}

/** One decode of a new photo: its corners, its upright size, and the preview the screen shows. */
export function inspectPhoto(photo: Blob): Promise<InspectedPhoto> {
  return offThreadOr({ kind: 'inspect', photo }, () => inspectWith(pageKit, photo));
}

/** The preview turned `turns` quarters clockwise, for setting corners on a page shot sideways. */
export async function turnImage(image: Blob, turns: number): Promise<Blob> {
  const n = ((turns % 4) + 4) % 4;
  const img = await loadImage(image);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = n % 2 ? h : w;
  canvas.height = n % 2 ? w : h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((n * Math.PI) / 2);
  ctx.drawImage(img, -w / 2, -h / 2);
  try {
    return await canvasToBlob(canvas, 'image/jpeg', 0.85);
  } finally {
    freeCanvas(canvas);
  }
}

/** One page: flattened to its corners and its bend, given its look, kept as a high-quality JPEG. A
 * failure to measure the bend is ours, reported, and the page is flattened by its corners alone. */
export async function processPage(photo: Blob, quad: Quad, filter: ScanFilter): Promise<ProcessedPage> {
  const { page, measureError }: ProcessedWithReport = await offThreadOr(
    { kind: 'process', photo, quad, filter },
    () => processWith(pageKit, photo, quad, filter),
  );
  if (measureError) reportError('pdf_tool_run', measureError, 'scan_measure_bend');
  return page;
}

/** Fit pages print at this density whatever the size limit did to their pixels. */
const FIT_DPI = 200;

/** One step of the search: every page at this scale and quality, one canvas at a time. */
async function encodePages(pages: ProcessedPage[], scale: number, quality: number, pageSize: PageSize, signal?: AbortSignal): Promise<BuiltPage[]> {
  const out: BuiltPage[] = [];
  for (const page of pages) {
    throwIfAborted(signal);
    const surface = drawCapped(pageKit, await pageKit.decode(page.blob), OUTPUT_LONG_EDGE, scale);
    try {
      const blob = await surface.toBlob('image/jpeg', quality);
      out.push({ blob, place: placeImage(surface.canvas.width, surface.canvas.height, pageSize, 72 / FIT_DPI / scale) });
    } finally {
      surface.free();
    }
  }
  return out;
}

/** The PDF of every processed page, stepped down to `budgetBytes` when one is set, and its pages
 * as they are inside it (for the result view). A phone holds one page's canvas at a time. */
export async function buildScanPdf(
  pages: ProcessedPage[],
  { pageSize, budgetBytes, onProgress, signal }: { pageSize: PageSize; budgetBytes: number | null; onProgress?: (f: number) => void; signal?: AbortSignal },
): Promise<FitResult & { pages: BuiltPage[] }> {
  let built = 0;
  // Only the latest step's pages are kept; the search may try dozens.
  let latest: { pdf: Blob; pages: BuiltPage[] } | null = null;
  const fit = await fitScanToBudget<number>({
    budgetBytes,
    deadlineMs: Date.now() + MAX_SEARCH_MS,
    render: (scale) => scale,
    build: async (scale, quality) => {
      const encoded = await encodePages(pages, scale, quality, pageSize, signal);
      const files = encoded.map((page, i) => new File([page.blob], `page-${i + 1}.jpg`, { type: 'image/jpeg' }));
      const pdf = await imagesToPdf(files, undefined, signal, { pageSize, pointsPerPixel: 72 / FIT_DPI / scale });
      latest = { pdf, pages: encoded };
      built += 1;
      // The search runs at most a few dozen builds; the bar moves fast, then waits on the last.
      onProgress?.(1 - 1 / (built + 1));
      return pdf;
    },
  });
  // The winner was an earlier step: the same canvas, scale and quality encode the same bytes again.
  const shown = latest && (latest as { pdf: Blob }).pdf === fit.blob
    ? (latest as { pages: BuiltPage[] }).pages
    : await encodePages(pages, fit.scale, fit.quality, pageSize, signal);
  return { ...fit, pages: shown };
}
