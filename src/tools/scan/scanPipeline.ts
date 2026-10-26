// Scan's DOM side, loaded with one import() once the first photo is in, so the page's
// first load carries none of the warp, filter or edge code (docs/scan-to-pdf.md).
// Everything here is canvas plumbing around the pure modules beside it.
import { guessCorners } from './edges/index.ts';
import { warpPerspective, warpSize } from './warp.ts';
import { applyFilter, type ScanFilter } from './filters.ts';
import { scaleQuad, type GrayImage, type Quad } from './quad.ts';
import { fitScanToBudget, type FitResult } from './scanBudget.ts';
import { canvasToBlob } from '../../lib/canvasBlob.js';
import { imagesToPdf } from '../../lib/imagesToPdf.js';
import { MAX_SEARCH_MS } from '../../lib/targetSizeSearch.js';

export type PageSize = 'fit' | 'a4' | 'letter';
export interface ProcessedPage { blob: Blob; width: number; height: number }

/** The photo is read at most this big; a 48 MP photo would not fit a phone's canvas budget. */
const SOURCE_LONG_EDGE = 3200;
/** About 200 dpi on A4: sharp text, and a three-page scan near a megabyte. */
const OUTPUT_LONG_EDGE = 2400;
/** The edge guess looks at a small copy; the page's outline survives, the noise does not. */
const GUESS_LONG_EDGE = 320;
/** A processed page is kept at this quality; the PDF is encoded from it. */
const KEEP_QUALITY = 0.92;

// An <img> rather than createImageBitmap: drawImage then honours the EXIF orientation the
// same way the corner editor's <img> shows it, on every browser, so the corners line up.
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

function drawCapped(img: HTMLImageElement, longEdge: number, scale = 1): HTMLCanvasElement {
  const fit = Math.min(1, longEdge / Math.max(img.naturalWidth, img.naturalHeight)) * scale;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * fit));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * fit));
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const pixels = (canvas: HTMLCanvasElement) =>
  (canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D).getImageData(0, 0, canvas.width, canvas.height);

const freeCanvas = (canvas: HTMLCanvasElement) => {
  canvas.width = 0;
  canvas.height = 0;
};

/** The page's corners as the edge guess sees them, or null when it finds no page. */
export async function guessPage(photo: Blob): Promise<Quad | null> {
  const canvas = drawCapped(await loadImage(photo), GUESS_LONG_EDGE);
  const { data, width, height } = pixels(canvas);
  freeCanvas(canvas);
  const gray: GrayImage = { width, height, data: new Uint8ClampedArray(width * height) };
  for (let i = 0, j = 0; j < gray.data.length; i += 4, j += 1) {
    gray.data[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return guessCorners(gray);
}

/** One page: flattened to its corners, given its look, kept as a high-quality JPEG. */
export async function processPage(photo: Blob, quad: Quad, filter: ScanFilter): Promise<ProcessedPage> {
  const source = drawCapped(await loadImage(photo), SOURCE_LONG_EDGE);
  const src = pixels(source);
  freeCanvas(source);
  const quadPx = scaleQuad(quad, src.width, src.height);
  const { width, height } = warpSize(quadPx, OUTPUT_LONG_EDGE);
  const flat = applyFilter(warpPerspective(src, quadPx, width, height), filter);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  (out.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(flat.data as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  try {
    return { blob: await canvasToBlob(out, 'image/jpeg', KEEP_QUALITY), width, height };
  } finally {
    freeCanvas(out);
  }
}

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Scan build aborted', 'AbortError');
};

/** Fit pages print at this density whatever the size limit did to their pixels. */
const FIT_DPI = 200;

/** The PDF of every processed page, stepped down to `budgetBytes` when one is set. Each step
 * decodes, draws and encodes one page at a time, so a phone holds one page's canvas, not all of them. */
export async function buildScanPdf(
  pages: ProcessedPage[],
  { pageSize, budgetBytes, onProgress, signal }: { pageSize: PageSize; budgetBytes: number | null; onProgress?: (f: number) => void; signal?: AbortSignal },
): Promise<FitResult> {
  let built = 0;
  return fitScanToBudget<number>({
    budgetBytes,
    deadlineMs: Date.now() + MAX_SEARCH_MS,
    render: (scale) => scale,
    build: async (scale, quality) => {
      const files: File[] = [];
      for (let i = 0; i < pages.length; i += 1) {
        throwIfAborted(signal);
        const canvas = drawCapped(await loadImage(pages[i].blob), OUTPUT_LONG_EDGE, scale);
        try {
          files.push(new File([await canvasToBlob(canvas, 'image/jpeg', quality)], `page-${i + 1}.jpg`, { type: 'image/jpeg' }));
        } finally {
          freeCanvas(canvas);
        }
      }
      const pdf = await imagesToPdf(files, undefined, signal, { pageSize, pointsPerPixel: 72 / FIT_DPI / scale });
      built += 1;
      // The search runs at most a few dozen builds; the bar moves fast, then waits on the last.
      onProgress?.(1 - 1 / (built + 1));
      return pdf;
    },
  });
}
