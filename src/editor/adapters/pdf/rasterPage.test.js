// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RASTER_SCALE,
  RASTER_JPEG_QUALITY,
  MAX_CANVAS_AREA,
  MAX_CANVAS_SIDE,
  rasterScaleFor,
  rasterizePageToJpeg,
} from './rasterPage.js';

const pageOf = (w, h) => ({
  view: [0, 0, w, h],
  rotate: 0,
  getViewport: ({ scale }) => ({ scale, width: w * scale, height: h * scale }),
  render: () => ({ promise: Promise.resolve() }),
});

describe('rasterScaleFor', () => {
  it('keeps the shared scale for a normal page', () => {
    expect(rasterScaleFor(100, 200)).toBe(RASTER_SCALE);
  });
  it('shrinks to fit the canvas area and side limits', () => {
    const s = rasterScaleFor(10000, 10000);
    expect(s).toBeLessThan(RASTER_SCALE);
    expect(10000 * s * 10000 * s).toBeLessThanOrEqual(MAX_CANVAS_AREA);
    const thin = rasterScaleFor(20, 100000);
    expect(100000 * thin).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
  });
});

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
      getViewport: ({ scale }) => ({ scale, width: 100 * scale, height: 200 * scale }),
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

  it('caps the canvas of a huge page and paints with the scale it rendered at', async () => {
    const paint = vi.fn();
    const canvases = [];
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'canvas') canvases.push(el);
      return el;
    });
    const page = pageOf(10000, 10000);
    const getViewport = vi.spyOn(page, 'getViewport');
    await rasterizePageToJpeg(page, { paint });
    const { width, height } = canvases[0];
    expect(width * height).toBeLessThanOrEqual(MAX_CANVAS_AREA);
    expect(Math.max(width, height)).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    expect(paint.mock.calls[0][1].scale).toBe(getViewport.mock.calls.at(-1)[0].scale);
  });

  it('throws instead of returning empty bytes when the browser cannot encode', async () => {
    encode.mockImplementationOnce(() => 'data:,');
    await expect(rasterizePageToJpeg(pageOf(100, 200))).rejects.toThrow(/came back empty/);
  });
});
