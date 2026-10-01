import { getPdfRenderContext } from '../../../lib/pdfRender.js';
import { pageGeometryFromPdfJsPage } from '../../geometry/coords.ts';

/** Render scale for a rasterized page: crisp and readable. */
export const RASTER_SCALE = 2.5;
/** JPEG quality for a rasterized page. */
export const RASTER_JPEG_QUALITY = 0.95;

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
  const viewport = pdfjsPage.getViewport({ scale: RASTER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = getPdfRenderContext(canvas);
  await pdfjsPage.render({ canvasContext: ctx, viewport }).promise;
  if (paint) paint(ctx, viewport, canvas);
  const dataUrl = canvas.toDataURL('image/jpeg', RASTER_JPEG_QUALITY);
  const { width, height } = pageGeometryFromPdfJsPage(pdfjsPage);
  return { jpeg: base64ToBytes(dataUrl.split(',')[1]), width, height };
}

/** Adds a page of the given size (points) holding only the JPEG, edge to edge. */
export async function buildImageOnlyPage(newDoc, jpegBytes, width, height) {
  const page = newDoc.addPage([width, height]);
  page.drawImage(await newDoc.embedJpg(jpegBytes), { x: 0, y: 0, width, height });
  return page;
}
