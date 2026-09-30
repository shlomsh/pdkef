/**
 * Flat PDF bytes + scan parameters -> an image-only PDF that looks scanned. The page is rendered
 * through `scanGeometry`'s matrix (rotation, offset and dpi in one step), so the pixels and the
 * expected rects derived from that same matrix cannot disagree. Every random choice is seeded.
 */
import { createCanvas } from '@napi-rs/canvas';
import { createDocument, addFixturePage, saveDocument } from './document.mjs';
import { renderFirstPage } from './pdfjs.mjs';
import { scanGeometry } from './geometry.mjs';
import { PAGE } from '../forms.mjs';

export const JPEG_QUALITY = 0.82;
/** Paper colour as a per-channel gain applied to the greyscale render (white becomes this warm grey). */
const PAPER_TONE = [243, 240, 234];
const NOISE_AMPLITUDE = 5;
/** Share of a 3x3 box average mixed into each pixel: a very mild blur. */
const BLUR_MIX = 0.35;
const SPECK_COUNT = 24;
const SPECK_RADIUS = { min: 0.6, max: 1.6 };
const SPECK_STYLE = 'rgba(70, 70, 70, 0.28)';
const MAX_BYTE = 255;

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function luminance({ data }, pixelCount) {
  const grey = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    grey[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  return grey;
}

function blurred(grey, width, height) {
  const out = new Float32Array(grey.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) { sum += grey[ny * width + nx]; count += 1; }
        }
      }
      out[y * width + x] = grey[y * width + x] * (1 - BLUR_MIX) + (sum / count) * BLUR_MIX;
    }
  }
  return out;
}

/** Greyscale, mild blur, warm paper tone and seeded noise, written back into `image`. */
function applyPaperLook(image, width, height, random) {
  const grey = blurred(luminance(image, width * height), width, height);
  for (let i = 0; i < grey.length; i += 1) {
    const noise = (random() - 0.5) * 2 * NOISE_AMPLITUDE;
    PAPER_TONE.forEach((gain, channel) => {
      image.data[i * 4 + channel] = Math.round(Math.min(MAX_BYTE, Math.max(0, (grey[i] / MAX_BYTE) * gain + noise)));
    });
    image.data[i * 4 + 3] = MAX_BYTE;
  }
}

function addSpecks(ctx, width, height, random) {
  ctx.fillStyle = SPECK_STYLE;
  for (let i = 0; i < SPECK_COUNT; i += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = SPECK_RADIUS.min + random() * (SPECK_RADIUS.max - SPECK_RADIUS.min);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** @returns {Promise<{bytes: Uint8Array, geometry: object, jpegQuality: number}>} */
export async function buildScanPdf(flatBytes, scan, title) {
  const geometry = scanGeometry(scan);
  const { pixelWidth, pixelHeight } = geometry;
  const rendered = await renderFirstPage(flatBytes, geometry);
  const canvas = createCanvas(pixelWidth, pixelHeight);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(rendered, 0, 0);
  const random = mulberry32(scan.seed);
  const image = ctx.getImageData(0, 0, pixelWidth, pixelHeight);
  applyPaperLook(image, pixelWidth, pixelHeight, random);
  ctx.putImageData(image, 0, 0);
  addSpecks(ctx, pixelWidth, pixelHeight, random);

  const doc = await createDocument(title);
  const jpeg = await doc.embedJpg(await canvas.encode('jpeg', Math.round(JPEG_QUALITY * 100)));
  addFixturePage(doc).drawImage(jpeg, { x: 0, y: 0, width: PAGE.width, height: PAGE.height });
  return { bytes: await saveDocument(doc), geometry, jpegQuality: JPEG_QUALITY };
}
