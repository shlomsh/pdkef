// Pixels out of the playing video (SCAN-08). DOM; where it reads and how it packs is frameGeometry.ts.
import { canvasToBlob } from '#lib/images/canvasBlob.js';
import type { GrayImage } from '#lib/pageEnhance/quad.ts';
import { focusRect, FOCUS_SIZE, grabRect, grayFromRgba, packFrame, type FrameMessage } from './frameGeometry.ts';
import type { Rect } from './types.ts';
import { visibleShare, WHOLE_FRAME } from './viewfinderModel.ts';

/** The part `view` (0..1 of the frame; default all of it) of the current frame as gray pixels with the short edge of
 * that part at `shortEdge`; null until the video has a size.
 * @testSeam */
export function grabGray(video: HTMLVideoElement, canvas: HTMLCanvasElement, shortEdge = 320, view: Rect = WHOLE_FRAME): GrayImage | null {
  const { videoWidth: vw, videoHeight: vh } = video;
  if (!vw || !vh) return null;
  const { sx, sy, sw, sh, width, height } = grabRect(vw, vh, view, shortEdge);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
  return grayFromRgba(ctx.getImageData(0, 0, width, height).data, width, height);
}

/** A square from the video's centre, FOCUS_SHARE of its short edge and at least FOCUS_SIZE px, drawn at up to FOCUS_SIZE
 * px, as gray pixels (same conversion as grabGray); clamped to the video. Null until the video has a size.
 * @testSeam */
export function grabFocusPatch(video: HTMLVideoElement, canvas: HTMLCanvasElement): GrayImage | null {
  const { videoWidth: vw, videoHeight: vh } = video;
  if (!vw || !vh) return null;
  const { sx, sy, from, side } = focusRect(vw, vh, FOCUS_SIZE);
  if (canvas.width !== side) canvas.width = side;
  if (canvas.height !== side) canvas.height = side;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, sx, sy, from, from, 0, 0, side, side);
  return grayFromRgba(ctx.getImageData(0, 0, side, side).data, side, side);
}

export type { FrameMessage };

/** A grabber with its own two canvases: the frame at `t` as one message, its buffers ready to transfer. */
export function frameGrabber() {
  const canvas = document.createElement('canvas');
  const patchCanvas = document.createElement('canvas');
  return (video: HTMLVideoElement, t: number): { message: FrameMessage; transfer: ArrayBuffer[]; view: Rect } | null => {
    const view = visibleShare({ width: video.videoWidth, height: video.videoHeight }, { width: video.clientWidth, height: video.clientHeight });
    const gray = grabGray(video, canvas, 320, view);
    if (!gray) return null;
    return { ...packFrame(t, gray, grabFocusPatch(video, patchCanvas)), view };
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
