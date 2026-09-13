import { canvasToBlob, MIN_QUALITY, MAX_QUALITY, QUALITY_SEARCH_STEPS, MAX_SEARCH_MS } from './compress.js';
import { searchTargetSize } from './targetSizeSearch.js';

// Scale ladder tried in order, highest fidelity first. The floor, 0.15, is
// deliberately conservative rather than matching the PDF ladder's lowest
// tier: a modern phone photo is at least ~3000px on its long edge, so 0.15
// still lands at 450px or more, which stays legible for the portal-photo /
// ID-photo use case this tool targets (the KB caps people search for -
// 100KB, 200KB, 1MB - are exactly the limits those portals impose). Going
// lower would trade size for an image nobody could use for its purpose,
// which is not what "compress" should mean.
const IMAGE_SCALE_LADDER = [1, 0.75, 0.5, 0.3, 0.15];

async function decodeViaImageBitmap(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return {
    width: bitmap.width,
    height: bitmap.height,
    drawTo(ctx, width, height) {
      ctx.drawImage(bitmap, 0, 0, width, height);
    },
    close() {
      bitmap.close?.();
    },
  };
}

async function decodeViaImageElement(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      drawTo(ctx, width, height) {
        ctx.drawImage(img, 0, 0, width, height);
      },
      close() {
        // Nothing to release - the <img> element isn't attached to the DOM.
      },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// createImageBitmap with { imageOrientation: 'from-image' } bakes a phone
// photo's EXIF rotation into the decoded pixels, so the output comes out
// upright without us having to read the EXIF ourselves. jsdom (and some
// older browsers) don't implement createImageBitmap at all, so fall back to
// decoding through an <img> element instead, which honours EXIF orientation
// on its own. Kept as two separate named steps (rather than one function
// with a try/catch inline) so each path is easy to exercise on its own in
// tests, the way compress.test.js swaps out canvas/pdfjs internals.
async function decodeImage(file) {
  try {
    return await decodeViaImageBitmap(file);
  } catch {
    return decodeViaImageElement(file);
  }
}

/**
 * Compresses an image (JPEG or PNG) 100% client-side by re-encoding it as
 * JPEG, searching for the smallest scale/quality combination that fits a
 * target size. Shares its search with compressPdfToTarget via
 * targetSizeSearch.js, so the two tools can't drift on the behaviour their
 * FAQ describes for both.
 *
 * Output is always image/jpeg. A PNG can't be quality-searched (it's
 * lossless), so PNG input is decoded and re-encoded as JPEG the same as
 * JPEG input; any transparency is flattened onto a white background first.
 * Re-encoding through canvas also strips EXIF, including GPS, from the
 * output - that's a side effect of decode-and-redraw, not a deliberate
 * scrub, but it does mean the result carries no location metadata.
 *
 * @param {File|Blob} file - image/jpeg or image/png input.
 * @param {Object} options
 * @param {number} options.targetKB - target output size, in kilobytes.
 * @param {Function} [options.onProgress] - callback for progress (0 to 1).
 * @returns {Promise<{ blob: Blob, metTarget: boolean, width: number, height: number, originalWidth: number, originalHeight: number }>}
 */
export async function compressImageToTarget(file, { targetKB, onProgress } = {}) {
  const targetBytes = Math.max(1, Math.round(targetKB * 1024));

  const decoded = await decodeImage(file);
  const { width: originalWidth, height: originalHeight } = decoded;

  try {
    // Already under target - don't degrade quality (or reformat a PNG) for
    // nothing. Same passthrough rule as compressPdfToTarget.
    if (file.size <= targetBytes) {
      onProgress?.(1);
      return {
        blob: file,
        metTarget: true,
        width: originalWidth,
        height: originalHeight,
        originalWidth,
        originalHeight,
      };
    }

    const deadline = Date.now() + MAX_SEARCH_MS;

    const renderAtScale = (scale, scaleIndex) => {
      const width = Math.max(1, Math.round(originalWidth * scale));
      const height = Math.max(1, Math.round(originalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      // JPEG has no transparency - fill white first so a transparent PNG
      // doesn't turn black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      decoded.drawTo(ctx, width, height);
      onProgress?.((scaleIndex + 0.5) / IMAGE_SCALE_LADDER.length);
      return { canvas, width, height };
    };

    const encode = (handle, quality) => canvasToBlob(handle.canvas, 'image/jpeg', quality);

    const best = await searchTargetSize({
      scales: IMAGE_SCALE_LADDER,
      renderAtScale,
      encode,
      budgetBytes: targetBytes,
      minQuality: MIN_QUALITY,
      maxQuality: MAX_QUALITY,
      qualitySteps: QUALITY_SEARCH_STEPS,
      deadlineMs: deadline,
    });

    onProgress?.(1);

    return {
      blob: best.encoded,
      metTarget: best.encoded.size <= targetBytes,
      width: best.handle.width,
      height: best.handle.height,
      originalWidth,
      originalHeight,
    };
  } finally {
    decoded.close();
  }
}
