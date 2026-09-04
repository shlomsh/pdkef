// Limits keep the on-device signature library small enough that one upload
// cannot consume ordinary browser-storage budgets. PNG is retained so drawn
// signatures preserve transparency.

export const MAX_SAVED_SIGNATURE_PIXELS = 1_000_000;
export const MAX_SAVED_SIGNATURE_ENCODED_BYTES = 750_000;

export interface ImageDimensions { width: number; height: number; }

/** Scales proportionally so an image never exceeds the documented one-megapixel cap. */
export function constrainSignatureDimensions({ width, height }: ImageDimensions): ImageDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return { width: 1, height: 1 };
  const pixels = width * height;
  if (pixels <= MAX_SAVED_SIGNATURE_PIXELS) return { width: Math.round(width), height: Math.round(height) };
  const scale = Math.sqrt(MAX_SAVED_SIGNATURE_PIXELS / pixels);
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

/** The base64 payload's decoded byte length, excluding the data-URL header. */
export function dataUrlEncodedBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return Number.POSITIVE_INFINITY;
  const payload = dataUrl.length - comma - 1;
  const padding = dataUrl.endsWith('==') ? 2 : dataUrl.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload * 3) / 4) - padding);
}

export interface EncodedSignatureImage {
  dataUrl: string;
  width: number;
  height: number;
  downsampled: boolean;
}

/**
 * Converts a canvas to a bounded PNG. First it enforces the pixel cap, then
 * repeatedly shrinks by 20% until its actual encoded size fits 750 KB.
 */
export function encodeSignatureCanvas(canvas: HTMLCanvasElement): EncodedSignatureImage {
  let width = canvas.width;
  let height = canvas.height;
  let source = canvas;
  let downsampled = false;
  const constrained = constrainSignatureDimensions({ width, height });
  if (constrained.width !== width || constrained.height !== height) {
    source = resizeCanvas(canvas, constrained); width = constrained.width; height = constrained.height; downsampled = true;
  }
  let dataUrl = source.toDataURL('image/png');
  while (dataUrlEncodedBytes(dataUrl) > MAX_SAVED_SIGNATURE_ENCODED_BYTES && (width > 1 || height > 1)) {
    const next = { width: Math.max(1, Math.floor(width * 0.8)), height: Math.max(1, Math.floor(height * 0.8)) };
    if (next.width === width && next.height === height) break;
    source = resizeCanvas(source, next); width = next.width; height = next.height; downsampled = true;
    dataUrl = source.toDataURL('image/png');
  }
  return { dataUrl, width, height, downsampled };
}

function resizeCanvas(source: HTMLCanvasElement, dimensions: ImageDimensions): HTMLCanvasElement {
  const target = document.createElement('canvas');
  target.width = dimensions.width;
  target.height = dimensions.height;
  target.getContext('2d')!.drawImage(source, 0, 0, source.width, source.height, 0, 0, target.width, target.height);
  return target;
}
