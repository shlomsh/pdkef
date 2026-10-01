// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RASTER_SCALE, RASTER_JPEG_QUALITY, rasterizePageToJpeg } from './rasterPage.js';

describe('rasterizePageToJpeg', () => {
  let original;
  const encode = vi.fn(() => 'data:image/jpeg;base64,/9j/AA==');
  beforeEach(() => {
    original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = encode;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({});
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.toDataURL = original;
    vi.restoreAllMocks();
  });

  it('renders at the shared scale, paints between render and encode, returns bytes and point size', async () => {
    const order = [];
    const page = {
      view: [0, 0, 100, 200],
      rotate: 0,
      getViewport: ({ scale }) => ({ width: 100 * scale, height: 200 * scale }),
      render: () => ({ promise: Promise.resolve().then(() => order.push('render')) }),
    };
    const paint = vi.fn(() => order.push('paint'));
    encode.mockImplementationOnce(() => (order.push('encode'), 'data:image/jpeg;base64,/9j/AA=='));
    const out = await rasterizePageToJpeg(page, { paint });
    expect(order).toEqual(['render', 'paint', 'encode']);
    expect(paint.mock.calls[0][1].width).toBe(100 * RASTER_SCALE);
    expect(encode).toHaveBeenCalledWith('image/jpeg', RASTER_JPEG_QUALITY);
    expect(Array.from(out.jpeg)).toEqual([0xff, 0xd8, 0xff, 0x00]);
    expect([out.width, out.height]).toEqual([100, 200]);
  });
});
