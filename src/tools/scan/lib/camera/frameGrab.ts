// Pixels out of the playing video (SCAN-08). DOM; no jsdom test.
import { canvasToBlob } from '#lib/images/canvasBlob.js';
import type { GrayImage } from '../quad.ts';

/** The current frame as gray pixels with the short edge at `shortEdge`; null until the video has a size. */
export function grabGray(video: HTMLVideoElement, canvas: HTMLCanvasElement, shortEdge = 320): GrayImage | null {
  const { videoWidth: vw, videoHeight: vh } = video;
  if (!vw || !vh) return null;
  const scale = shortEdge / Math.min(vw, vh);
  const width = Math.max(1, Math.round(vw * scale));
  const height = Math.max(1, Math.round(vh * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) data[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return { width, height, data };
}

/** The current frame as a small JPEG, for the flight into the stack. */
export function snapshot(video: HTMLVideoElement, longEdge = 480): Promise<Blob> {
  const { videoWidth: vw, videoHeight: vh } = video;
  const scale = longEdge / Math.max(vw, vh, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vw * scale));
  canvas.height = Math.max(1, Math.round(vh * scale));
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, 'image/jpeg', 0.8);
}
