// Where on the video a frame is read, and how its pixels are packed for the worker (SCAN-08): the plain numbers and typed
// arrays behind frameGrab.ts, which only draws.
import type { GrayImage } from '#lib/pageEnhance/quad.ts';
import type { Rect } from './types.ts';

/** How much of the short edge the focus crop covers: 256 px of a 1080 px frame, enough to land on print. */
const FOCUS_SHARE = 256 / 1080;
/** The most pixels a side of the focus crop is drawn at. */
export const FOCUS_SIZE = 256;

/** What the frame loop sends the worker: the frame, and the centre crop for the focus measure. */
export interface FrameMessage {
  t: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  patch: { width: number; height: number; buffer: ArrayBuffer } | null;
}

/** The part `view` (0..1 of a vw x vh frame) as a source rect, and the size it is drawn at: the short edge of that part at `shortEdge`. */
export function grabRect(vw: number, vh: number, view: Rect, shortEdge: number): { sx: number; sy: number; sw: number; sh: number; width: number; height: number } {
  const sx = view.x * vw;
  const sy = view.y * vh;
  const sw = view.width * vw;
  const sh = view.height * vh;
  const scale = shortEdge / Math.min(sw, sh);
  return { sx, sy, sw, sh, width: Math.max(1, Math.round(sw * scale)), height: Math.max(1, Math.round(sh * scale)) };
}

/** The centre square of a vw x vh frame the focus measure reads: `from` source pixels a side, FOCUS_SHARE of the short edge and at
 * least `size`, clamped to the frame, drawn at `side` (at most `size`) pixels. */
export function focusRect(vw: number, vh: number, size: number): { sx: number; sy: number; from: number; side: number } {
  const short = Math.min(vw, vh);
  const from = Math.min(short, Math.max(size, Math.round(short * FOCUS_SHARE)));
  return { sx: Math.floor((vw - from) / 2), sy: Math.floor((vh - from) / 2), from, side: Math.min(size, from) };
}

/** RGBA pixels as gray, by the 0.299/0.587/0.114 weights. */
export function grayFromRgba(rgba: Uint8ClampedArray, width: number, height: number): GrayImage {
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) data[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return { width, height, data };
}

/** The frame at `t` as one message, its buffers ready to transfer. */
export function packFrame(t: number, gray: GrayImage, crop: GrayImage | null): { message: FrameMessage; transfer: ArrayBuffer[] } {
  const buffer = gray.data.buffer as ArrayBuffer;
  const patch = crop && { width: crop.width, height: crop.height, buffer: crop.data.buffer as ArrayBuffer };
  return { message: { t, width: gray.width, height: gray.height, buffer, patch }, transfer: patch ? [buffer, patch.buffer] : [buffer] };
}
