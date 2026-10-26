import { describe, expect, it } from 'vitest';
import { MAX_CANVAS_AREA, MAX_CANVAS_SIDE } from '../../lib/canvasLimits.js';
import { compressRenderScale } from './compress.js';

const canvasFor = (w, h, scale) => ({ width: Math.floor(w * scale), height: Math.floor(h * scale) });

describe('compressRenderScale', () => {
  it('keeps a US Letter page at exactly the level scale', () => {
    for (const scale of [1.0, 1.5, 2.0, 1.1, 0.85, 0.65, 0.5]) {
      expect(compressRenderScale(612, 792, scale)).toBe(scale);
    }
  });

  it.each([
    ['5000 x 5000 pt', 5000, 5000],
    ['A0 (2384 x 3370 pt)', 2384, 3370],
    ['a long roll (600 x 20000 pt)', 600, 20000],
  ])('keeps the canvas of %s inside the browser limit at the top scale', (_name, w, h) => {
    const canvas = canvasFor(w, h, compressRenderScale(w, h, 2.0));
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(MAX_CANVAS_AREA);
    expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
  });
});
