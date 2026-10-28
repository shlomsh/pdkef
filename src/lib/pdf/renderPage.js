import { getPdfRenderContext } from './pdfRender.js';
import { clampScaleToCanvas } from '../images/canvasLimits.js';
import { throwIfAborted } from '../output/abort.js';

/**
 * The one way to paint a pdf.js page into a new canvas: the wanted scale, lowered so the
 * canvas stays inside the browser's limits (DEBT-63), then the page painted over `background`.
 *
 * @param {import('pdfjs-dist').PDFPageProxy} page
 * @param {{ scale: number, rotation?: number, background?: string | null, signal?: AbortSignal }} options
 *   `rotation` is the absolute turn (default: the page's own /Rotate). `background` is the fill
 *   behind the page, white by default (paper, and JPEG has no alpha); `null` leaves it transparent.
 *   A `signal` that fires mid-render cancels the pdf.js RenderTask (so it stops painting and
 *   releases the canvas) and the call throws the abort; one that fires just after the render
 *   settles throws too, so a caller that gave up gets no result.
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderPageToCanvas(page, { scale, rotation, background = '#ffffff', signal }) {
  const unit = page.getViewport({ scale: 1, rotation });
  const viewport = page.getViewport({ scale: clampScaleToCanvas(unit.width, unit.height, scale), rotation });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = getPdfRenderContext(canvas);
  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const renderTask = page.render({ canvasContext: context, viewport });
  const onAbort = () => renderTask.cancel();
  signal?.addEventListener('abort', onAbort);
  try {
    await renderTask.promise;
  } catch (err) {
    throwIfAborted(signal);
    throw err;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  throwIfAborted(signal);
  return canvas;
}
