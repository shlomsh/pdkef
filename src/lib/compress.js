import { PDFDocument } from '@cantoo/pdf-lib';
import { getPdfRenderContext } from '../editor/adapters/pdf/renderContext.js';
import { searchTargetSize } from './targetSizeSearch.js';

let pdfjsLib;

async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href;
  }
  return pdfjsLib;
}

// Exported so compressImage.js's search can reuse it and the two tools
// cannot drift on how a canvas becomes a Blob.
export function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      type,
      quality,
    );
  });
}

/**
 * Compresses a PDF file 100% client-side by rasterizing its pages.
 * 
 * @param {File} file - The original PDF file.
 * @param {Object} options
 * @param {string} [options.level='medium'] - 'low' | 'medium' | 'high'
 * @param {Function} [options.onProgress] - Callback for progress (0 to 1).
 * @returns {Promise<Blob>} The compressed PDF Blob.
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
  const bytes = await file.arrayBuffer();
  const loadingTask = lib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  const pdfDoc = await PDFDocument.create();

  try {
    const totalPages = pdf.numPages;

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      
      // Viewport for rendering to canvas at selected scale
      const viewport = page.getViewport({ scale });
      
      // Viewport at scale 1 to set the new PDF page size in points (1 point = 1/72 inch)
      const nativeViewport = page.getViewport({ scale: 1 });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = getPdfRenderContext(canvas);

      // JPEG has no transparency - fill white first to prevent black background
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: context, viewport }).promise;
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
    return new Blob([compressedBytes], { type: 'application/pdf' });
  } finally {
    await loadingTask.destroy();
  }
}

// DPI tiers tried in order, highest quality first. Each step is only
// rendered if the previous (higher-DPI) tier can't hit the target even at
// the lowest JPEG quality.
const TARGET_SCALE_LADDER = [1.5, 1.1, 0.85, 0.65, 0.5]; // ~108, 79, 61, 47, 36 DPI
// Quality bounds and search budget are exported so compressImage.js's search
// uses the exact same numbers - the FAQ describes one search behaviour for
// both tools, and they must not drift apart.
export const MIN_QUALITY = 0.05;
export const MAX_QUALITY = 0.92;
export const QUALITY_SEARCH_STEPS = 6;
// Hard wall-clock budget for the whole DPI-tier x quality search. The loops
// above are already finite (5 tiers x 6 steps), but each step's cost scales
// with page count and resolution, so a large/adversarial PDF could still
// take a very long time to exhaust every tier. Once the budget is spent we
// stop searching and ship the best-effort result found so far rather than
// let the tab hang.
export const MAX_SEARCH_MS = 20000;
// Conservative per-page allowance for PDF container overhead (page object,
// xref entries, etc.) so the byte-budget search doesn't overshoot the
// caller's target once the pages are actually assembled into a PDF.
const PDF_OVERHEAD_BYTES_PER_PAGE = 300;

function sumBlobSizes(blobs) {
  return blobs.reduce((sum, blob) => sum + blob.size, 0);
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
 * @returns {Promise<{ blob: Blob, metTarget: boolean }>}
 */
export async function compressPdfToTarget(file, { targetKB, onProgress } = {}) {
  const targetBytes = Math.max(1, Math.round(targetKB * 1024));

  // Already under target - don't degrade quality for nothing.
  if (file.size <= targetBytes) {
    onProgress?.(1);
    return { blob: file, metTarget: true };
  }

  const lib = await getPdfjs();
  const bytes = await file.arrayBuffer();
  const loadingTask = lib.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  try {
    const totalPages = pdf.numPages;
    const pageBudget = Math.max(1, targetBytes - totalPages * PDF_OVERHEAD_BYTES_PER_PAGE);
    const deadline = Date.now() + MAX_SEARCH_MS;

    // A "handle" here is every page rendered at one DPI tier; "encode" turns
    // that whole tier into per-page JPEG blobs and reports their combined
    // size, which is what the byte budget above is measured against.
    const renderAtScale = async (scale, scaleIndex) => {
      const rendered = [];
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const nativeViewport = page.getViewport({ scale: 1 });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = getPdfRenderContext(canvas);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;

        rendered.push({ canvas, nativeViewport });
        onProgress?.((scaleIndex + pageNumber / totalPages) / (TARGET_SCALE_LADDER.length + 1));
      }
      return rendered;
    };

    const encode = async (rendered, quality) => {
      const blobs = await Promise.all(rendered.map((r) => canvasToBlob(r.canvas, 'image/jpeg', quality)));
      return { size: sumBlobSizes(blobs), blobs };
    };

    const best = await searchTargetSize({
      scales: TARGET_SCALE_LADDER,
      renderAtScale,
      encode,
      budgetBytes: pageBudget,
      minQuality: MIN_QUALITY,
      maxQuality: MAX_QUALITY,
      qualitySteps: QUALITY_SEARCH_STEPS,
      deadlineMs: deadline,
    });

    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < best.handle.length; i += 1) {
      const imgBytes = await best.encoded.blobs[i].arrayBuffer();
      const img = await pdfDoc.embedJpg(imgBytes);
      const viewport = best.handle[i].nativeViewport;
      const newPage = pdfDoc.addPage([viewport.width, viewport.height]);
      newPage.drawImage(img, { x: 0, y: 0, width: viewport.width, height: viewport.height });
    }
    onProgress?.(1);

    const finalBytes = await pdfDoc.save();
    const blob = new Blob([finalBytes], { type: 'application/pdf' });
    return { blob, metTarget: blob.size <= targetBytes };
  } finally {
    await loadingTask.destroy();
  }
}
