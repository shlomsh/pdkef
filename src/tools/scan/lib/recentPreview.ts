/** The Recents tile is 64x84 CSS pixels; twice that on the long edge stays sharp on a phone. */
const PREVIEW_LONG_EDGE = 168;

/**
 * Page 1 of a scan as a small JPEG data URL, for the home page's Recents tile (SCAN-18). The recency index
 * lives in localStorage, so the preview must be a string and small. Null where the browser cannot decode
 * a blob into a bitmap: the tile then shows its plain document icon.
 */
export async function recentPreview(thumb: Blob): Promise<string | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(thumb);
  const canvas = document.createElement('canvas');
  try {
    const fit = Math.min(1, PREVIEW_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * fit));
    canvas.height = Math.max(1, Math.round(bitmap.height * fit));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', 0.75);
    return url.startsWith('data:image/') ? url : null;
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
