import { describe, expect, it } from 'vitest';
import { MAX_CANVAS_AREA, MAX_CANVAS_SIDE, clampScaleToCanvas } from './canvasLimits.js';

const canvasFor = (w, h, scale) => ({ width: Math.floor(w * scale), height: Math.floor(h * scale) });

describe('clampScaleToCanvas', () => {
  it('keeps a US Letter page at exactly the wanted scale', () => {
    for (const scale of [0.5, 0.65, 0.85, 1, 1.1, 1.5, 2, 3]) {
      expect(clampScaleToCanvas(612, 792, scale)).toBe(scale);
    }
  });

  it.each([
    ['5000 x 5000 pt', 5000, 5000],
    ['A0 (2384 x 3370 pt)', 2384, 3370],
    ['a long roll (600 x 20000 pt)', 600, 20000],
  ])('keeps the canvas of %s inside the browser limit at the top scales', (_name, w, h) => {
    for (const wanted of [2, 3]) {
      const canvas = canvasFor(w, h, clampScaleToCanvas(w, h, wanted));
      expect(canvas.width * canvas.height).toBeLessThanOrEqual(MAX_CANVAS_AREA);
      expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    }
  });
});
