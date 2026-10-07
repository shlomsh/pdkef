import { getPdfRenderContext } from '../../../lib/pdfRender.js';
import { pageGeometryFromPdfJsPage } from '../../geometry/coords.ts';

/** Render scale for a rasterized page: crisp and readable. */
export const RASTER_SCALE = 2.5;
/** JPEG quality for a rasterized page. */
export const RASTER_JPEG_QUALITY = 0.95;
/** Largest canvas area in pixels (4096 x 4096): iOS Safari's limit, the smallest we support. */
export const MAX_CANVAS_AREA = 16_777_216;
/** Longest canvas side in pixels. */
export const MAX_CANVAS_SIDE = 16_384;

/**
 * The render scale for a page of the given size at scale 1 (CSS px): the
 * shared scale, lowered so the canvas stays inside the browser's limits. Past
 * them toDataURL returns an empty "data:," and the picture is lost.
 */
export function rasterScaleFor(width, height) {
  return Math.min(
    RASTER_SCALE,
    Math.sqrt(MAX_CANVAS_AREA / (width * height)),
    MAX_CANVAS_SIDE / width,
    MAX_CANVAS_SIDE / height,
  );
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
  const viewport = pdfjsPage.getViewport({ scale: rasterScaleFor(unit.width, unit.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = getPdfRenderContext(canvas);
  await pdfjsPage.render({ canvasContext: ctx, viewport }).promise;
  if (paint) paint(ctx, viewport, canvas);
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
