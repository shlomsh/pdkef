import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/images/canvasBlob.js', () => ({ canvasToBlob: vi.fn(async () => new Blob(['jpg'])) }));

import { canvasToBlob } from '#lib/images/canvasBlob.js';
import { grabGray, snapshot } from './frameGrab.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function fakeCanvas(pixel: [number, number, number, number] = [0, 0, 0, 255]) {
  const ctx = {
    drawImage: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < data.length; i += 4) data.set(pixel, i);
      return { data };
    }),
  };
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx) };
  return { canvas: canvas as unknown as HTMLCanvasElement, ctx };
}
const video = (videoWidth: number, videoHeight: number) => ({ videoWidth, videoHeight }) as HTMLVideoElement;

describe('grabGray', () => {
  it('returns null while the video has no size', () => {
    const { canvas, ctx } = fakeCanvas();
    expect(grabGray(video(0, 0), canvas)).toBeNull();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('scales so the short edge is 320', () => {
    const { canvas } = fakeCanvas();
    const got = grabGray(video(1920, 1080), canvas)!;
    expect(got.width).toBe(569);
    expect(got.height).toBe(320);
    expect(got.data.length).toBe(569 * 320);
    expect(canvas.width).toBe(569);
    expect(canvas.height).toBe(320);
  });

  it('converts RGBA to gray with the 0.299/0.587/0.114 weights', () => {
    const { canvas } = fakeCanvas([200, 100, 50, 255]);
    const got = grabGray(video(640, 320), canvas, 32)!;
    expect(got.data[0]).toBe(Math.floor(0.299 * 200 + 0.587 * 100 + 0.114 * 50));
  });
});

describe('snapshot', () => {
  it('draws the frame scaled to the long edge and encodes a JPEG', async () => {
    const { canvas, ctx } = fakeCanvas();
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    const blob = await snapshot(video(1920, 1080), 480);
    expect(canvas.width).toBe(480);
    expect(canvas.height).toBe(270);
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(canvasToBlob).toHaveBeenCalledWith(canvas, 'image/jpeg', 0.8);
    expect(blob).toBeInstanceOf(Blob);
  });
});
