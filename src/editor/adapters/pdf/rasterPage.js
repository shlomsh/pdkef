import { MAX_CANVAS_AREA, MAX_CANVAS_SIDE, clampScaleToCanvas } from '../../../lib/canvasLimits.js';
import { renderPageToCanvas } from '../../../lib/renderPage.js';
import { pageGeometryFromPdfJsPage } from '../../geometry/coords.ts';

/** Render scale for a rasterized page: crisp and readable. */
export const RASTER_SCALE = 2.5;
/** JPEG quality for a rasterized page. */
export const RASTER_JPEG_QUALITY = 0.95;
export { MAX_CANVAS_AREA, MAX_CANVAS_SIDE };

/**
 * The render scale for a page of the given size at scale 1 (CSS px): the
 * shared scale, lowered so the canvas stays inside the browser's limits. Past
 * them toDataURL returns an empty "data:," and the picture is lost.
 */
export function rasterScaleFor(width, height) {
  return clampScaleToCanvas(width, height, RASTER_SCALE);
}

const base64ToBytes = (base64) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

/**
 * Renders one pdf.js page to a canvas and encodes it as JPEG. `paint(ctx,
 * viewport)` runs after the page render and before encoding, so a caller can
 * draw over the picture.
 *
 * @returns {Promise<{ jpeg: Uint8Array, width: number, height: number }>}
 *   width and height are the page's size in PDF points.
 */
export async function rasterizePageToJpeg(pdfjsPage, { paint } = {}) {
  const unit = pdfjsPage.getViewport({ scale: 1 });
  const scale = rasterScaleFor(unit.width, unit.height);
  // Paper white behind the page: JPEG has no alpha, a transparent page would come out black.
  const canvas = await renderPageToCanvas(pdfjsPage, { scale });
  if (paint) paint(canvas.getContext('2d'), pdfjsPage.getViewport({ scale }), canvas);
  const dataUrl = canvas.toDataURL('image/jpeg', RASTER_JPEG_QUALITY);
  const jpeg = base64ToBytes(dataUrl.split(',')[1] ?? '');
  // An over-limit or failed encode yields "data:,"; never embed that as a page.
  if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    throw new Error('The page picture came back empty.');
  }
  const { width, height } = pageGeometryFromPdfJsPage(pdfjsPage);
  return { jpeg, width, height };
}

/** Adds a page of the given size (points) holding only the JPEG, edge to edge. */
export async function buildImageOnlyPage(newDoc, jpegBytes, width, height) {
  const page = newDoc.addPage([width, height]);
  page.drawImage(await newDoc.embedJpg(jpegBytes), { x: 0, y: 0, width, height });
  return page;
}
