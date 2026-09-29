import { describe, expect, it } from 'vitest';
import {
  makeStroke, simplifyStroke, strokeBBox, strokeInPixels, strokeSvgInPoints, strokeSvgPath, STROKE_MIN_STEP_PT,
  type StrokePoint,
} from './strokeGeometry.ts';

// A 600 x 800pt page: 1% of width is 6pt, 1% of height is 8pt.
const W = 600;
const H = 800;

describe('simplifyStroke', () => {
  it('returns empty and single-point strokes as they are', () => {
    expect(simplifyStroke([], 0.5, W, H)).toEqual([]);
    expect(simplifyStroke([[10, 10]], 0.5, W, H)).toEqual([[10, 10]]);
  });

  it('drops points closer than the step, measured in points not percent', () => {
    // 0.05% of width = 0.3pt (dropped); 0.2% = 1.2pt (kept).
    const out = simplifyStroke([[10, 10], [10.05, 10], [10.08, 10], [10.4, 10], [20, 10]], 0.5, W, H);
    expect(out).toEqual([[10, 10], [10.4, 10], [20, 10]]);
  });

  it('measures x and y with their own page scale', () => {
    // 0.05% of height = 0.4pt < 0.5 (dropped); 0.05% of width = 0.3pt too.
    expect(simplifyStroke([[10, 10], [10, 10.05], [30, 30]], 0.5, W, H)).toEqual([[10, 10], [30, 30]]);
    // 0.1% of height = 0.8pt >= 0.5 (kept).
    expect(simplifyStroke([[10, 10], [10, 10.1], [30, 30]], 0.5, W, H)).toHaveLength(3);
  });

  it('keeps both endpoints, ending where the pointer lifted', () => {
    const out = simplifyStroke([[10, 10], [20, 10], [20.02, 10]], 0.5, W, H);
    expect(out[0]).toEqual([10, 10]);
    expect(out[out.length - 1]).toEqual([20.02, 10]);
    expect(out).toEqual([[10, 10], [20.02, 10]]);
  });

  it('keeps a stationary press-release as a start and an end point', () => {
    expect(simplifyStroke([[10, 10], [10, 10], [10, 10]], 0.5, W, H)).toEqual([[10, 10], [10, 10]]);
  });

  it('does not mutate its input', () => {
    const input: StrokePoint[] = [[1, 1], [1.01, 1], [50, 50]];
    const copy = JSON.stringify(input);
    simplifyStroke(input, 0.5, W, H);
    expect(JSON.stringify(input)).toBe(copy);
  });

  it('shrinks a dense drag a lot', () => {
    const dense: StrokePoint[] = Array.from({ length: 1000 }, (_, i) => [10 + i * 0.01, 50]);
    expect(simplifyStroke(dense, 0.5, W, H).length).toBeLessThan(dense.length / 5);
  });
});

describe('strokeBBox', () => {
  it('grows the point extent by the brush radius on every side', () => {
    // radius 10pt = 1.6667% of width, 1.25% of height
    const box = strokeBBox([[20, 30], [40, 50]], 20, W, H);
    expect(box.left).toBeCloseTo(20 - 10 / 6, 6);
    expect(box.top).toBeCloseTo(30 - 1.25, 6);
    expect(box.width).toBeCloseTo(20 + 20 / 6, 6);
    expect(box.height).toBeCloseTo(20 + 2.5, 6);
  });

  it('clamps to the page', () => {
    const box = strokeBBox([[0.1, 99.9], [99.9, 0.2]], 40, W, H);
    expect(box.left).toBe(0);
    expect(box.top).toBe(0);
    expect(box.left + box.width).toBe(100);
    expect(box.top + box.height).toBe(100);
  });

  it('gives a single point a brush-sized box', () => {
    const box = strokeBBox([[50, 50]], 12, W, H);
    expect(box.width).toBeCloseTo(12 / 6, 6);
    expect(box.height).toBeCloseTo(12 / 8, 6);
  });

  it('is empty for no points', () => {
    expect(strokeBBox([], 10, W, H)).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });
});

describe('makeStroke', () => {
  const base = { id: 's1', pageIndex: 2, sizePt: 10, pageWidthPt: W, pageHeightPt: H };

  it('builds a whiteout stroke with simplified points, bbox and colour', () => {
    const s = makeStroke('whiteoutStroke', { ...base, points: [[10, 10], [10.01, 10], [30, 10]], color: '#e0e0e0' });
    expect(s).toMatchObject({ id: 's1', type: 'whiteoutStroke', pageIndex: 2, sizePt: 10, color: '#e0e0e0' });
    expect(s.points).toEqual([[10, 10], [30, 10]]);
    expect(s.left).toBeCloseTo(10 - 5 / 6, 6);
    expect(s.width).toBeCloseTo(20 + 10 / 6, 6);
  });

  it('defaults a whiteout stroke to white', () => {
    expect(makeStroke('whiteoutStroke', { ...base, points: [[5, 5]] }).color).toBe('#ffffff');
  });

  it('builds a blur stroke carrying its strength only when given', () => {
    const withStrength = makeStroke('blurStroke', { ...base, points: [[5, 5], [9, 9]], strength: 'strong' });
    expect(withStrength).toMatchObject({ type: 'blurStroke', strength: 'strong' });
    const without = makeStroke('blurStroke', { ...base, points: [[5, 5], [9, 9]] });
    expect('strength' in without).toBe(false);
    expect('color' in without).toBe(false);
  });

  it('uses the half-point step', () => {
    expect(STROKE_MIN_STEP_PT).toBe(0.5);
  });
});

describe('strokeSvgPath', () => {
  it('maps points into 0..100 relative to the bbox', () => {
    const bbox = { left: 10, top: 20, width: 40, height: 10 };
    expect(strokeSvgPath([[10, 20], [30, 25], [50, 30]], bbox)).toBe('M 0 0 L 50 50 L 100 100');
  });

  it('draws a single point as a zero-length segment so round caps still show a dot', () => {
    const bbox = { left: 10, top: 10, width: 10, height: 10 };
    expect(strokeSvgPath([[15, 15]], bbox)).toBe('M 50 50 L 50 50');
  });

  it('survives a zero-size bbox', () => {
    expect(strokeSvgPath([[10, 10]], { left: 10, top: 10, width: 0, height: 0 })).toBe('M 0 0 L 0 0');
  });

  it('is empty without points', () => {
    expect(strokeSvgPath([], { left: 0, top: 0, width: 1, height: 1 })).toBe('');
  });
});

describe('strokeSvgInPoints', () => {
  it('uses a point-unit viewBox so the brush stays round', () => {
    const s = makeStroke('whiteoutStroke', { id: 'a', pageIndex: 0, points: [[10, 10], [30, 10]], sizePt: 12, pageWidthPt: W, pageHeightPt: H });
    const svg = strokeSvgInPoints(s, W, H);
    expect(svg.strokeWidth).toBe(12);
    const [, , vw, vh] = svg.viewBox.split(' ').map(Number);
    expect(vw).toBeCloseTo((s.width / 100) * W, 2);
    expect(vh).toBeCloseTo((s.height / 100) * H, 2);
    // Start point sits one radius in from the bbox corner.
    expect(svg.d.startsWith('M 6 6 ')).toBe(true);
  });
});

describe('strokeInPixels', () => {
  it('maps a stroke onto the export canvas at the raster scale', () => {
    const px = strokeInPixels(
      { points: [[20, 45], [40, 45]], sizePt: 20, left: 10, top: 40, width: 40, height: 10 },
      500, 500, 2.5,
    );
    expect(px.points).toEqual([[100, 225], [200, 225]]);
    expect(px.diameter).toBe(50);
    expect([px.x, px.y, px.w, px.h]).toEqual([50, 200, 200, 50]);
  });
});

describe('a tap is round on any page size', () => {
  // A4 (595.28 x 841.89pt) and Letter (612 x 792pt): the same brush must give a
  // circle as wide as it is tall in page points on both.
  it.each([
    ['A4', 595.28, 841.89],
    ['Letter', 612, 792],
  ])('%s', (_name, widthPt, heightPt) => {
    const stroke = makeStroke('whiteoutStroke', {
      id: 't', pageIndex: 0, points: [[50, 50]], sizePt: 20, pageWidthPt: widthPt, pageHeightPt: heightPt,
    });
    expect((stroke.width / 100) * widthPt).toBeCloseTo(20, 3);
    expect((stroke.height / 100) * heightPt).toBeCloseTo(20, 3);
    const svg = strokeSvgInPoints(stroke, widthPt, heightPt);
    const [, , vbW, vbH] = svg.viewBox.split(' ').map(Number);
    expect(vbW).toBeCloseTo(20, 2);
    expect(vbH).toBeCloseTo(20, 2);
    expect(svg.strokeWidth).toBe(20);
  });
});

