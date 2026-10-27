// Scan's DOM side, loaded with one import() once the first photo is in, so the page's
// first load carries none of the warp, filter or edge code (docs/scan-to-pdf.md).
// Everything here is canvas plumbing around the pure modules beside it.
import { guessCorners } from './edges/index.ts';
import { warpPerspective, warpSize } from './warp.ts';
import { applyFilter, type ScanFilter } from './filters.ts';
import { insetQuad, scaleQuad, type GrayImage, type Quad } from './quad.ts';
import { fitScanToBudget, type FitResult } from './scanBudget.ts';
import { canvasToBlob } from '../../lib/canvasBlob.js';
import { throwIfAborted } from '../../lib/abort.js';
import { imagesToPdf } from '../../lib/imagesToPdf.js';
import { placeImage } from '../../lib/imagePage.js';
import { MAX_SEARCH_MS } from '../../lib/targetSizeSearch.js';

export type PageSize = 'fit' | 'a4' | 'letter';
export interface ProcessedPage {
  blob: Blob;
  width: number;
  height: number;
  /** A small copy for the page strip: phones drop decoded images once their memory budget fills. */
  thumb: Blob;
}
/** What a new photo needs on screen: its corners, its shape, and a preview small enough to decode. */
export interface InspectedPhoto { quad: Quad | null; width: number; height: number; preview: Blob }
/** placeImage's shape: PDF points, y from the page's bottom. */
export interface Placement { pageWidth: number; pageHeight: number; x: number; y: number; width: number; height: number }
/** One page of the built PDF: the very JPEG inside it, and where it sits on its paper. */
export interface BuiltPage { blob: Blob; place: Placement }

/** The photo is read at most this big; a 48 MP photo would not fit a phone's canvas budget. */
const SOURCE_LONG_EDGE = 3200;
/** About 200 dpi on A4: sharp text, and a three-page scan near a megabyte. */
const OUTPUT_LONG_EDGE = 2400;
/** The edge guess looks at a small copy; the page's outline survives, the noise does not. */
const GUESS_LONG_EDGE = 320;
/** How far inside its corners a page is cropped: about 0.8% from each edge, a margin's worth. The
 * edge guess works on a 320px copy, so a corner can sit a pixel of that (0.3%) out on the table, and
 * that sliver turns into a black line under the Document look (QA, 2026-10-26). */
const EDGE_INSET = 0.016;
/** A processed page is kept at this quality; the PDF is encoded from it. */
const KEEP_QUALITY = 0.92;
/** The corner editor and loupe show this, never the photo itself: 12 MP decodes to 48 MB, and iPhone
 * Safari drops images (they render at zero size) once its decoded-image budget fills. 2.5x of a phone
 * width still has the pixels the loupe needs. */
const PREVIEW_LONG_EDGE = 1600;
const THUMB_LONG_EDGE = 480;

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

function grayOf(source: CanvasImageSource, w: number, h: number): GrayImage {
  const fit = Math.min(1, GUESS_LONG_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * fit));
  canvas.height = Math.max(1, Math.round(h * fit));
  (canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D).drawImage(source, 0, 0, canvas.width, canvas.height);
  const { data, width, height } = pixels(canvas);
  freeCanvas(canvas);
  const gray: GrayImage = { width, height, data: new Uint8ClampedArray(width * height) };
  for (let i = 0, j = 0; j < gray.data.length; i += 4, j += 1) {
    gray.data[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return gray;
}

/** The page's corners as the edge guess sees them, or null when it finds no page. */
export async function guessPage(photo: Blob): Promise<Quad | null> {
  const img = await loadImage(photo);
  return guessCorners(grayOf(img, img.naturalWidth, img.naturalHeight));
}

/** One decode of a new photo: its corners, its upright size, and the preview the screen shows. The
 * corners are guessed from the preview's own JPEG, exactly as Auto-detect guesses them (guessPage on
 * the same bytes), so the first corners and Auto-detect's are the same corners. */
export async function inspectPhoto(photo: Blob): Promise<InspectedPhoto> {
  const img = await loadImage(photo);
  const canvas = drawCapped(img, PREVIEW_LONG_EDGE);
  let preview: Blob;
  try {
    preview = await canvasToBlob(canvas, 'image/jpeg', 0.85);
  } finally {
    freeCanvas(canvas);
  }
  return { quad: await guessPage(preview), width: img.naturalWidth, height: img.naturalHeight, preview };
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

/** One page: flattened to its corners, given its look, kept as a high-quality JPEG. */
export async function processPage(photo: Blob, quad: Quad, filter: ScanFilter): Promise<ProcessedPage> {
  const source = drawCapped(await loadImage(photo), SOURCE_LONG_EDGE);
  const src = pixels(source);
  freeCanvas(source);
  const quadPx = scaleQuad(insetQuad(quad, EDGE_INSET), src.width, src.height);
  const { width, height } = warpSize(quadPx, OUTPUT_LONG_EDGE);
  const flat = applyFilter(warpPerspective(src, quadPx, width, height), filter);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  (out.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(flat.data as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  const fit = Math.min(1, THUMB_LONG_EDGE / Math.max(width, height));
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(width * fit));
  small.height = Math.max(1, Math.round(height * fit));
  try {
    (small.getContext('2d') as CanvasRenderingContext2D).drawImage(out, 0, 0, small.width, small.height);
    return {
      blob: await canvasToBlob(out, 'image/jpeg', KEEP_QUALITY),
      width,
      height,
      thumb: await canvasToBlob(small, 'image/jpeg', 0.8),
    };
  } finally {
    freeCanvas(out);
    freeCanvas(small);
  }
}

/** Fit pages print at this density whatever the size limit did to their pixels. */
const FIT_DPI = 200;

/** One step of the search: every page at this scale and quality, one canvas at a time. */
async function encodePages(pages: ProcessedPage[], scale: number, quality: number, pageSize: PageSize, signal?: AbortSignal): Promise<BuiltPage[]> {
  const out: BuiltPage[] = [];
  for (const page of pages) {
    throwIfAborted(signal);
    const canvas = drawCapped(await loadImage(page.blob), OUTPUT_LONG_EDGE, scale);
    try {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      out.push({ blob, place: placeImage(canvas.width, canvas.height, pageSize, 72 / FIT_DPI / scale) });
    } finally {
      freeCanvas(canvas);
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
