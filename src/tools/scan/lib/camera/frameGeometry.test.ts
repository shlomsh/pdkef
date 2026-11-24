import { describe, expect, it } from 'vitest';
import { FOCUS_SIZE, focusRect, grabRect, grayFromRgba, packFrame } from './frameGeometry.ts';
import { WHOLE_FRAME } from './viewfinderModel.ts';

describe('grabRect', () => {
  it('scales the whole frame so the short edge is 320', () => {
    expect(grabRect(1920, 1080, WHOLE_FRAME, 320)).toEqual({ sx: 0, sy: 0, sw: 1920, sh: 1080, width: 569, height: 320 });
  });

  it('reads only the share of the frame it is given, with the short edge of the share at the asked size', () => {
    expect(grabRect(640, 480, { x: 0.25, y: 0, width: 0.5, height: 1 }, 320)).toEqual({ sx: 160, sy: 0, sw: 320, sh: 480, width: 320, height: 480 });
  });

  it('draws at least one pixel each way', () => {
    expect(grabRect(4000, 10, WHOLE_FRAME, 0.1)).toMatchObject({ width: 40, height: 1 });
    expect(grabRect(10, 4000, WHOLE_FRAME, 0.1)).toMatchObject({ width: 1, height: 40 });
  });
});

describe('focusRect', () => {
  it('takes a 256px square from the centre of a 1080p frame', () => {
    expect(focusRect(1920, 1080, FOCUS_SIZE)).toEqual({ sx: 832, sy: 412, from: 256, side: 256 });
  });

  // SCAN-16: a fixed 256px of a full-size stream is a sliver of the page, often blank paper.
  it('covers the same share of a full-size video, drawn at 256px', () => {
    expect(focusRect(3024, 4032, FOCUS_SIZE)).toEqual({ sx: 1153, sy: 1657, from: 717, side: 256 });
  });

  it('clamps the square to a small video', () => {
    expect(focusRect(200, 120, FOCUS_SIZE)).toEqual({ sx: 40, sy: 0, from: 120, side: 120 });
  });
});

describe('grayFromRgba', () => {
  it('converts RGBA to gray with the 0.299/0.587/0.114 weights, to the nearest level', () => {
    const rgb = [[200, 100, 50], [0, 255, 0], [255, 0, 0], [0, 0, 255], [2, 187, 238], [2, 136, 255], [0, 17, 136], [0, 34, 119], [0, 0, 153], [0, 0, 119]];
    const gray = grayFromRgba(new Uint8ClampedArray(rgb.flatMap((pixel) => [...pixel, 255])), rgb.length, 1);
    expect([gray.width, gray.height]).toEqual([rgb.length, 1]);
    expect(Array.from(gray.data)).toEqual([124, 150, 76, 29, 137, 110, 25, 34, 17, 14]);
  });
});

describe('packFrame', () => {
  const grayOf = (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height) });

  it('packs the frame and the focus crop into one message, both buffers transferred', () => {
    const { message, transfer } = packFrame(5, grayOf(569, 320), grayOf(256, 256));
    expect(message).toMatchObject({ t: 5, width: 569, height: 320, patch: { width: 256, height: 256 } });
    expect(message.buffer.byteLength).toBe(569 * 320);
    expect(message.patch!.buffer.byteLength).toBe(256 * 256);
    expect(transfer).toEqual([message.buffer, message.patch!.buffer]);
    expect(transfer[0]).not.toBe(transfer[1]);
  });

  it('transfers only the frame when there is no focus crop', () => {
    const { message, transfer } = packFrame(7, grayOf(8, 4), null);
    expect(message.patch).toBeNull();
    expect(transfer).toEqual([message.buffer]);
  });
});
