// Renders every page of a PDF to an image Blob (PNG or JPEG) using PDF.js.
// Loaded lazily (dynamic import) so it never blocks the initial page paint.
// The worker is a same-origin bundled asset, never fetched from a CDN (see loadPdfjs.js).
import { PDFJS_WASM_URL } from '../../lib/pdfjsWasm.js';
import { parsePageSelector } from '../../lib/pageSelector.js';
import { getPdfjs } from '../../lib/loadPdfjs.js';
import { renderPageToCanvas } from '../../lib/renderPage.js';
import { throwIfAborted } from '../../lib/abort.js';
import { toBytes } from '../../lib/toBytes.js';
import { clampScaleToCanvas } from '../../lib/canvasLimits.js';

const EXTENSION_BY_FORMAT = { 'image/png': 'png', 'image/jpeg': 'jpg' };

export const imageExtension = (format) => EXTENSION_BY_FORMAT[format] ?? 'png';

/** The PDF's name without ".pdf"; what every image file is named after. */
export const imageBaseName = (fileName) => fileName.replace(/\.pdf$/i, '') || 'page';

/** "<base>.<ext>" for a lone image, "<base>-page-<page>.<ext>" when `page` is given (a number, or the heading's literal "N"). */
/** @param {string} baseName @param {string} extension @param {number | string | null} [page] */
export const imageFileName = (baseName, extension, page = null) =>
  (page === null ? `${baseName}.${extension}` : `${baseName}-page-${page}.${extension}`);

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      type,
      quality,
    );
  });
}

function fillWhiteIfJpeg(context, width, height, format) {
  if (format !== 'image/jpeg') return;
  // JPEG has no alpha channel - fill white first so a transparent PDF
  // background doesn't render as black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
}

// The page's own /Rotate plus the turn the person gave it, kept in [0, 360).
const turnedBy = (page, turn = 0) => (((page.rotate + turn) % 360) + 360) % 360;

/**
 * The scale for a stacked image of pages (each `{ width, height }` at scale 1,
 * turned sizes): the chosen scale, lowered uniformly for every page when the
 * combined canvas (widest page by summed heights) would pass the limits.
 */
export function stackedRenderScale(unitSizes, scale) {
  const width = Math.max(...unitSizes.map((p) => p.width));
  const height = unitSizes.reduce((sum, p) => sum + p.height, 0);
  return clampScaleToCanvas(width, height, scale);
}

// A PNG keeps the page's transparency; a JPEG has no alpha, so it gets paper white.
const renderPage = (page, scale, format, turn) =>
  renderPageToCanvas(page, {
    scale,
    rotation: turnedBy(page, turn),
    background: format === 'image/jpeg' ? '#ffffff' : null,
  });

// Stacks per-page canvases into a single tall canvas, centering narrower
// pages horizontally. Browsers cap canvas height (commonly ~32,767px) and
// total pixel area, so very long or high-scale documents may need a lower
// scale to stay within that ceiling.
function stackCanvases(canvases, format) {
  const width = Math.max(...canvases.map((c) => c.width));
  const height = canvases.reduce((sum, c) => sum + c.height, 0);

  const combined = document.createElement('canvas');
  combined.width = width;
  combined.height = height;
  const context = combined.getContext('2d');
  fillWhiteIfJpeg(context, width, height, format);

  let y = 0;
  for (const canvas of canvases) {
    const x = Math.round((width - canvas.width) / 2);
    context.drawImage(canvas, x, y);
    y += canvas.height;
  }
  return combined;
}

// Converts a PDF File into image Blob(s) using PDF.js.
// format: 'image/png' | 'image/jpeg'.
// scale: render multiplier (1 = ~72dpi, 2 = ~144dpi, 3 = ~216dpi).
// layout: 'separate' (one image per page, default) | 'concatenated' (all
// pages stacked into a single tall image).
// rotations: extra quarter turns by 1-based page number ({ 2: 90 }), added to
// each page's own rotation; the tall image stacks the turned sizes.
// signal: an AbortSignal checked between pages; an abort throws an AbortError
// DOMException (the quiet-time prepare cancels a superseded build this way).
/**
 * @param {File} file
 * @param {{ format?: string, scale?: number, quality?: number, layout?: string, pages?: string,
 *   rotations?: Record<number, number>, onProgress?: (fraction: number) => void, signal?: AbortSignal }} [options]
 * @returns {Promise<{ pageNumber: number, blob: Blob, filename: string }[]>}
 */
export async function convertPdfToImages(
  file,
  {
    format = 'image/png',
    scale = 2,
    quality = 0.92,
    layout = 'separate',
    pages = '',
    rotations = {},
    onProgress,
    signal,
  } = {},
) {
  throwIfAborted(signal);
  const lib = await getPdfjs();
  const bytes = await toBytes(file);
  const loadingTask = lib.getDocument({ data: bytes, wasmUrl: PDFJS_WASM_URL });
  const pdf = await loadingTask.promise;
  const baseName = imageBaseName(file.name);
  const extension = imageExtension(format);
  const pageNumbers = parsePageSelector(pages, pdf.numPages);

  try {
    const stacked = layout === 'concatenated' && pageNumbers.length > 1;
    // A stack renders every page at one scale chosen from the combined size.
    let renderScale = scale;
    if (stacked) {
      const unitSizes = [];
      for (const pageNumber of pageNumbers) {
        const page = await pdf.getPage(pageNumber);
        unitSizes.push(page.getViewport({ scale: 1, rotation: turnedBy(page, rotations[pageNumber]) }));
      }
      renderScale = stackedRenderScale(unitSizes, scale);
    }
    const canvases = [];
    const images = [];
    for (let i = 0; i < pageNumbers.length; i += 1) {
      throwIfAborted(signal);
      const page = await pdf.getPage(pageNumbers[i]);
      const canvas = await renderPage(page, renderScale, format, rotations[pageNumbers[i]]);
      if (stacked) {
        canvases.push(canvas);
      } else {
        // Separate pages: encode now and free the bitmap before the next page,
        // so only one page canvas is alive at a time.
        throwIfAborted(signal);
        let blob;
        try {
          blob = await canvasToBlob(canvas, format, quality);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
        const filename = imageFileName(baseName, extension, pageNumbers.length === 1 ? null : pageNumbers[i]);
        images.push({ pageNumber: pageNumbers[i], blob, filename });
      }
      onProgress?.((i + 1) / pageNumbers.length);
    }

    throwIfAborted(signal);
    if (stacked) {
      const combined = stackCanvases(canvases, format);
      const blob = await canvasToBlob(combined, format, quality);
      return [{ pageNumber: pageNumbers[0], blob, filename: imageFileName(baseName, extension) }];
    }
    return images;
  } finally {
    // pdf.js v6 exposes teardown on the loading task, not the document proxy.
    await loadingTask.destroy();
  }
}
