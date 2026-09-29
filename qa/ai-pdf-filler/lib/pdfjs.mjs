/**
 * pdf.js in Node: page 1 rendering through an explicit points->pixels matrix, and text extraction.
 * Assets are read off disk the same way src/tools/sign/fields/corpus/scoring/score.js does.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { createCanvas } from '@napi-rs/canvas';

const pdfjsDir = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const WHITE = '#ffffff';

async function withFirstPage(bytes, use) {
  const loading = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: `${path.join(pdfjsDir, 'standard_fonts')}${path.sep}`,
    cMapUrl: `${path.join(pdfjsDir, 'cmaps')}${path.sep}`,
    wasmUrl: `${path.join(pdfjsDir, 'wasm')}${path.sep}`,
    cMapPacked: true,
    useSystemFonts: false,
  });
  try {
    return await use(await (await loading.promise).getPage(1));
  } finally {
    await loading.destroy();
  }
}

/** Renders page 1 onto a white canvas; `matrix` maps page points (top-left origin) to canvas pixels. */
export function renderFirstPage(bytes, { pixelWidth, pixelHeight, matrix }) {
  return withFirstPage(bytes, async (page) => {
    const canvas = createCanvas(pixelWidth, pixelHeight);
    const viewport = page.getViewport({ scale: 1 });
    await page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport, transform: matrix, background: WHITE }).promise;
    return canvas;
  });
}

export const countTextItems = (bytes) => withFirstPage(bytes, async (page) => (await page.getTextContent()).items.length);
