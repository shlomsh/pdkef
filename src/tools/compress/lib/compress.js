import { PDFJS_WASM_URL } from '../../../lib/pdf/pdfjsWasm.js';
import { searchTargetSize, MIN_QUALITY, MAX_QUALITY, QUALITY_SEARCH_STEPS, MAX_SEARCH_MS } from '../../../lib/images/targetSizeSearch.js';
import { canvasToBlob } from '../../../lib/images/canvasBlob.js';
import { getPdfLib } from '../../../lib/pdf/pdfLib.js';
import { getPdfjs } from '../../../lib/pdf/loadPdfjs.js';
import { renderPageToCanvas } from '../../../lib/pdf/renderPage.js';
import { toBytes } from '../../../lib/output/toBytes.js';

/**
 * Compresses a PDF file 100% client-side by rasterizing its pages.
 * 
 * @param {File} file - The original PDF file.
 * @param {Object} options
 * @param {string} [options.level='medium'] - 'low' | 'medium' | 'high'
 * @param {Function} [options.onProgress] - Callback for progress (0 to 1).
 * @returns {Promise<{ blob: Blob, rasterBytes: number }>} `rasterBytes` is the
 *   byte length of the rasterised PDF that was built; `blob` is that copy, or
 *   `file` itself when `rasterBytes >= file.size` (re-rendering would not
 *   make it smaller).
 */
export async function compressPdf(file, { level = 'medium', onProgress } = {}) {
  // Determine scale (DPI) and image quality based on compression level
  // Low compression -> high quality/DPI
  // High compression -> low quality/DPI
  let scale = 1.5; // ~110 DPI
  let quality = 0.6;

  if (level === 'high') {
    scale = 1.0; // ~72 DPI
    quality = 0.4;
  } else if (level === 'low') {
    scale = 2.0; // ~144 DPI
    quality = 0.8;
  }

  const lib = await getPdfjs();
  const { PDFDocument } = await getPdfLib();
  const bytes = await toBytes(file);
  const loadingTask = lib.getDocument({ data: bytes, wasmUrl: PDFJS_WASM_URL });
  const pdf = await loadingTask.promise;

  const pdfDoc = await PDFDocument.create();

  try {
    const totalPages = pdf.numPages;

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      
      // Viewport at scale 1 to set the new PDF page size in points (1 point = 1/72 inch)
      const nativeViewport = page.getViewport({ scale: 1 });

      // Rendered at the selected scale (lowered on a huge page) over white: JPEG has no transparency
      const canvas = await renderPageToCanvas(page, { scale });
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      const imgBytes = await blob.arrayBuffer();

      const img = await pdfDoc.embedJpg(imgBytes);
      const newPage = pdfDoc.addPage([nativeViewport.width, nativeViewport.height]);
      
      newPage.drawImage(img, {
        x: 0,
        y: 0,
        width: nativeViewport.width,
        height: nativeViewport.height,
      });

      onProgress?.(pageNumber / totalPages);
    }

    const compressedBytes = await pdfDoc.save();
    // A small or mostly-vector PDF is already leaner than a picture of each
    // page, so re-rendering it can only grow it. Hand the input back (same
    // reference - the tool's passthrough check) rather than a bigger file.
    const rasterBytes = compressedBytes.byteLength;
    if (rasterBytes >= file.size) return { blob: file, rasterBytes };
    return { blob: new Blob([compressedBytes], { type: 'application/pdf' }), rasterBytes };
  } finally {
    await loadingTask.destroy();
  }
}

// DPI tiers tried in order, highest quality first. Each step is only
// rendered if the previous (higher-DPI) tier can't hit the target even at
// the lowest JPEG quality.
const TARGET_SCALE_LADDER = [1.5, 1.1, 0.85, 0.65, 0.5]; // ~108, 79, 61, 47, 36 DPI
// The smallest valid JPEG (1x1). Assembling the output PDF around one of
// these per page measures the container's own bytes (catalog, page objects,
// image dictionaries, content streams, xref) before anything is rendered, so
// the search's budget is the target minus what the PDF really adds. A flat
// guess of 300 B a page undercounted it by ~570 B fixed plus ~215 B a page
// and missed reachable targets by up to 3%.
const PLACEHOLDER_JPEG = Uint8Array.from(
  atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='),
  (c) => c.charCodeAt(0),
);
// The real pages carry longer numbers than the placeholder's (image width,
// height and stream length, wider xref offsets): measured at 7 to 15 B a
// page across 1 to 100 pages and up to 2 MB a page.
const PDF_OVERHEAD_ALLOWANCE_PER_PAGE = 32;

async function addJpegPage(pdfDoc, jpegBytes, nativeViewport) {
  const img = await pdfDoc.embedJpg(jpegBytes);
  const page = pdfDoc.addPage([nativeViewport.width, nativeViewport.height]);
  page.drawImage(img, { x: 0, y: 0, width: nativeViewport.width, height: nativeViewport.height });
}

async function measurePdfOverhead(PDFDocument, nativeViewports) {
  const pdfDoc = await PDFDocument.create();
  for (const viewport of nativeViewports) await addJpegPage(pdfDoc, PLACEHOLDER_JPEG, viewport);
  const placeholderPdf = await pdfDoc.save();
  const pages = nativeViewports.length;
  return placeholderPdf.length - pages * PLACEHOLDER_JPEG.length + pages * PDF_OVERHEAD_ALLOWANCE_PER_PAGE;
}

function sumBlobSizes(blobs) {
  return blobs.reduce((sum, blob) => sum + blob.size, 0);
}

// Runs `mapper` over `items` with at most `limit` calls in flight at once,
// instead of Promise.all's unbounded fan-out - encoding every page of a
// large document concurrently spikes memory with that many JPEG encodes
// (and their raw canvases) in flight simultaneously.
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const ENCODE_CONCURRENCY = 4;

// Safety cap on raw canvas pixel memory (RGBA, 4 bytes/px) held at once
// while rendering one DPI tier of a target-size search. A 100-page A4 doc
// at the ladder's top tier (1.5, ~108 DPI) needs ~450MB for canvas pixels
// alone - enough to crash the tab on a phone - so a large document starts
// the search at whichever tier keeps it under this cap instead of always
// starting at the top.
export const MAX_RENDER_MEMORY_BYTES = 200 * 1024 * 1024; // 200MB

export function pickStartScaleIndex(scales, totalAreaAtScale1) {
  for (let i = 0; i < scales.length; i += 1) {
    if (totalAreaAtScale1 * scales[i] * scales[i] * 4 <= MAX_RENDER_MEMORY_BYTES) return i;
  }
  return scales.length - 1; // even the lowest tier exceeds the cap - it's the best available
}

function releaseRenderedCanvases(rendered) {
  for (const { canvas } of rendered) {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Compresses a PDF file 100% client-side, rasterizing pages and searching
 * for the highest JPEG quality (escalating to lower DPI tiers only if
 * needed) that keeps the output at or under a target file size.
 *
 * @param {File} file - The original PDF file.
 * @param {Object} options
 * @param {number} options.targetKB - Target output size, in kilobytes.
 * @param {Function} [options.onProgress] - Callback for progress (0 to 1).
 * @returns {Promise<{ blob: Blob, metTarget: boolean, rasterBytes: number | null }>}
 *   `blob` is `file` itself when already under target, or when no rasterised
 *   copy is smaller. `rasterBytes` is the rasterised PDF's byte length, or
 *   null when nothing was rasterised (already under target).
 */
export async function compressPdfToTarget(file, { targetKB, onProgress } = {}) {
  const targetBytes = Math.max(1, Math.round(targetKB * 1024));

  // Already under target - don't degrade quality for nothing.
  if (file.size <= targetBytes) {
    onProgress?.(1);
    return { blob: file, metTarget: true, rasterBytes: null };
  }

  const lib = await getPdfjs();
  const { PDFDocument } = await getPdfLib();
  const bytes = await toBytes(file);
  const loadingTask = lib.getDocument({ data: bytes, wasmUrl: PDFJS_WASM_URL });
  const pdf = await loadingTask.promise;

  try {
    const totalPages = pdf.numPages;
    const deadline = Date.now() + MAX_SEARCH_MS;

    // One pass to collect every page's native (scale-1) viewport, cheap
    // since it doesn't render anything. Used both to size the final PDF
    // pages and to pick a starting DPI tier that keeps the first render
    // under the memory cap regardless of page count.
    const nativeViewports = [];
    let totalAreaAtScale1 = 0;
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const nativeViewport = page.getViewport({ scale: 1 });
      nativeViewports.push(nativeViewport);
      totalAreaAtScale1 += nativeViewport.width * nativeViewport.height;
    }

    const pageBudget = Math.max(1, targetBytes - (await measurePdfOverhead(PDFDocument, nativeViewports)));

    const startScaleIndex = pickStartScaleIndex(TARGET_SCALE_LADDER, totalAreaAtScale1);
    const scales = TARGET_SCALE_LADDER.slice(startScaleIndex);

    // A "handle" here is every page rendered at one DPI tier; "encode" turns
    // that whole tier into per-page JPEG blobs and reports their combined
    // size, which is what the byte budget above is measured against.
    const renderAtScale = async (scale, scaleIndex) => {
      const rendered = [];
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const nativeViewport = nativeViewports[pageNumber - 1];
        const canvas = await renderPageToCanvas(page, { scale });

        rendered.push({ canvas, nativeViewport });
        onProgress?.((scaleIndex + pageNumber / totalPages) / (scales.length + 1));
      }
      return rendered;
    };

    const encode = async (rendered, quality) => {
      const blobs = await mapWithConcurrency(rendered, ENCODE_CONCURRENCY, (r) =>
        canvasToBlob(r.canvas, 'image/jpeg', quality),
      );
      return { size: sumBlobSizes(blobs), blobs };
    };

    const best = await searchTargetSize({
      scales,
      renderAtScale,
      encode,
      budgetBytes: pageBudget,
      minQuality: MIN_QUALITY,
      maxQuality: MAX_QUALITY,
      qualitySteps: QUALITY_SEARCH_STEPS,
      deadlineMs: deadline,
      releaseHandle: releaseRenderedCanvases,
    });

    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < best.handle.length; i += 1) {
      const imgBytes = await best.encoded.blobs[i].arrayBuffer();
      await addJpegPage(pdfDoc, imgBytes, best.handle[i].nativeViewport);
      // The blob is already embedded - release this page's raw pixels now
      // rather than holding the whole tier until the loop finishes.
      best.handle[i].canvas.width = 0;
      best.handle[i].canvas.height = 0;
    }
    onProgress?.(1);

    const finalBytes = await pdfDoc.save();
    // Over target and the rasterised copy is bigger than the input too: the
    // input is the closer result, so keep it (and say the target was missed).
    const rasterBytes = finalBytes.byteLength;
    if (rasterBytes >= file.size) return { blob: file, metTarget: false, rasterBytes };
    const blob = new Blob([finalBytes], { type: 'application/pdf' });
    return { blob, metTarget: blob.size <= targetBytes, rasterBytes };
  } finally {
    await loadingTask.destroy();
  }
}
