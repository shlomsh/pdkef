import { PDFDocument } from '@cantoo/pdf-lib';

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

function canvasToBlob(canvas, type, quality) {
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
      const context = canvas.getContext('2d');

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
const MIN_QUALITY = 0.05;
const MAX_QUALITY = 0.92;
const QUALITY_SEARCH_STEPS = 6;
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

    let bestResult = null; // { quality, blobs, viewports, totalSize }

    for (let scaleIndex = 0; scaleIndex < TARGET_SCALE_LADDER.length; scaleIndex += 1) {
      const scale = TARGET_SCALE_LADDER[scaleIndex];

      const rendered = [];
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const nativeViewport = page.getViewport({ scale: 1 });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;

        rendered.push({ canvas, nativeViewport });
        onProgress?.((scaleIndex + pageNumber / totalPages) / (TARGET_SCALE_LADDER.length + 1));
      }

      const floorBlobs = await Promise.all(
        rendered.map((r) => canvasToBlob(r.canvas, 'image/jpeg', MIN_QUALITY)),
      );
      const floorSize = sumBlobSizes(floorBlobs);

      // Keep the smallest result seen so far as a fallback, in case no tier
      // (even the lowest DPI at minimum quality) fits the target.
      if (!bestResult || floorSize < bestResult.totalSize) {
        bestResult = {
          quality: MIN_QUALITY,
          blobs: floorBlobs,
          viewports: rendered.map((r) => r.nativeViewport),
          totalSize: floorSize,
        };
      }

      if (floorSize > pageBudget) continue; // even minimum quality is too big at this DPI

      // Binary search the highest quality, at this DPI, that still fits.
      let lo = MIN_QUALITY;
      let hi = MAX_QUALITY;
      let feasible = bestResult;
      for (let step = 0; step < QUALITY_SEARCH_STEPS; step += 1) {
        const mid = (lo + hi) / 2;
        const blobs = await Promise.all(rendered.map((r) => canvasToBlob(r.canvas, 'image/jpeg', mid)));
        const totalSize = sumBlobSizes(blobs);
        if (totalSize <= pageBudget) {
          feasible = { quality: mid, blobs, viewports: rendered.map((r) => r.nativeViewport), totalSize };
          lo = mid;
        } else {
          hi = mid;
        }
      }

      bestResult = feasible;
      break; // this DPI tier fits the target - no need to drop further
    }

    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < bestResult.blobs.length; i += 1) {
      const imgBytes = await bestResult.blobs[i].arrayBuffer();
      const img = await pdfDoc.embedJpg(imgBytes);
      const viewport = bestResult.viewports[i];
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
