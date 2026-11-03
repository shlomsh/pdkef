// Pixels out of the playing video (SCAN-08). DOM; no jsdom test.
import { canvasToBlob } from '#lib/images/canvasBlob.js';
import type { GrayImage } from '../quad.ts';

/** The current frame as gray pixels with the short edge at `shortEdge`; null until the video has a size.
 * @testSeam */
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

/** A square of up to `size` px from the video's centre at its own resolution, as gray pixels (same conversion
 * as grabGray); clamped to the video. Null until the video has a size.
 * @testSeam */
export function grabFocusPatch(video: HTMLVideoElement, canvas: HTMLCanvasElement, size = 256): GrayImage | null {
  const { videoWidth: vw, videoHeight: vh } = video;
  if (!vw || !vh) return null;
  const side = Math.min(size, vw, vh);
  if (canvas.width !== side) canvas.width = side;
  if (canvas.height !== side) canvas.height = side;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, Math.floor((vw - side) / 2), Math.floor((vh - side) / 2), side, side, 0, 0, side, side);
  const rgba = ctx.getImageData(0, 0, side, side).data;
  const data = new Uint8ClampedArray(side * side);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) data[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return { width: side, height: side, data };
}

/** What the frame loop sends the worker: the frame, and the centre crop for the focus measure. */
export interface FrameMessage {
  t: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  patch: { width: number; height: number; buffer: ArrayBuffer } | null;
}

/** A grabber with its own two canvases: the frame at `t` as one message, its buffers ready to transfer. */
export function frameGrabber() {
  const canvas = document.createElement('canvas');
  const patchCanvas = document.createElement('canvas');
  return (video: HTMLVideoElement, t: number): { message: FrameMessage; transfer: ArrayBuffer[] } | null => {
    const gray = grabGray(video, canvas);
    if (!gray) return null;
    const crop = grabFocusPatch(video, patchCanvas);
    const buffer = gray.data.buffer as ArrayBuffer;
    const patch = crop && { width: crop.width, height: crop.height, buffer: crop.data.buffer as ArrayBuffer };
    return { message: { t, width: gray.width, height: gray.height, buffer, patch }, transfer: patch ? [buffer, patch.buffer] : [buffer] };
  };
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
