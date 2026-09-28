/**
 * RED-17: thin adapter that renders one saved page (annotations on, pdf.js's
 * default) and hands the pixels to `boxSolidity`. The caller supplies
 * `createCanvas` so this file never touches the DOM or an OffscreenCanvas
 * constructor directly, matching `pdfRender.js`'s one way to get a 2D
 * context.
 */
import { getPdfRenderContext } from '../../../lib/pdfRender.js';
import { boxSolidity } from './boxSolidity.ts';
import type { BoxSolidity, CheckBox } from './types.ts';

const RENDER_SCALE = 2;

export async function checkBoxesOnPage(
  page: any,
  boxes: CheckBox[],
  createCanvas: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas,
): Promise<BoxSolidity[]> {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = getPdfRenderContext(canvas as HTMLCanvasElement);

  await page.render({ canvasContext: ctx, viewport }).promise;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return boxSolidity({ data: imageData.data, width: canvas.width, height: canvas.height }, boxes);
}
