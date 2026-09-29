/** Fixture bytes + expected fields -> a JPEG with every expected rect outlined and labelled, for human review. */
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { renderFirstPage } from './pdfjs.mjs';
import { pageRasterAt } from './geometry.mjs';

const PREVIEW_DPI = 100;
/** JPEG keeps the noisy scan previews small; they are for eyes, not measurement. */
const PREVIEW_JPEG_QUALITY = 80;
const OUTLINE_WIDTH = 1.5;
const ID_FONT = '9px PreviewLabel';
const ID_INSET = 2;
const ID_BASELINE_GAP = 9;
const KIND_COLOURS = {
  text: '#d81b60', date: '#7b1fa2', comb: '#e65100', checkbox: '#0277bd', signature: '#2e7d32',
};

GlobalFonts.registerFromPath(fileURLToPath(new URL('../../../public/fonts/Arimo-Regular.ttf', import.meta.url)), 'PreviewLabel');

export async function renderPreview(fixtureBytes, expected) {
  const raster = pageRasterAt(PREVIEW_DPI);
  const canvas = await renderFirstPage(fixtureBytes, raster);
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = OUTLINE_WIDTH;
  ctx.font = ID_FONT;
  for (const target of expected.targets) {
    const colour = KIND_COLOURS[target.kind] ?? KIND_COLOURS.text;
    const x = target.bounds.x * raster.pixelWidth;
    const y = target.bounds.y * raster.pixelHeight;
    const w = target.bounds.width * raster.pixelWidth;
    const h = target.bounds.height * raster.pixelHeight;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.strokeRect(x, y, w, h);
    // Checkboxes are too small to hold their id; it sits just below them, pulled back inside the page if it would overflow.
    const idX = Math.min(x + ID_INSET, raster.pixelWidth - ctx.measureText(target.id).width - ID_INSET);
    ctx.fillText(target.id, idX, target.kind === 'checkbox' ? y + h + ID_BASELINE_GAP : y + ID_BASELINE_GAP);
  }
  return canvas.encode('jpeg', PREVIEW_JPEG_QUALITY);
}
