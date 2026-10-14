import { describe, it, expect } from 'vitest';
import {
  PAGE_RENDER_MIN_SCALE,
  MAX_PAGE_RENDER_AREA,
  MAX_PAGE_RENDER_DPR,
  WIDTH_BUCKET_PX,
  bucketWidth,
  pageRenderScale,
} from './pageRenderScale.js';

const A4 = { unitWidth: 595, unitHeight: 842 };

describe('pageRenderScale', () => {
  it('renders at the displayed device-pixel width', () => {
    // 790 CSS px at 2x is 1580 device px: 1580 / 595
    expect(pageRenderScale({ ...A4, cssWidth: 790, dpr: 2 })).toBeCloseTo(1580 / 595, 5);
  });
  it('never drops below the old fixed scale', () => {
    expect(pageRenderScale({ ...A4, cssWidth: 300, dpr: 1 })).toBe(PAGE_RENDER_MIN_SCALE);
  });
  it('falls back to the floor when the width is unknown or the page is empty', () => {
    expect(pageRenderScale({ ...A4, cssWidth: 0, dpr: 2 })).toBe(PAGE_RENDER_MIN_SCALE);
    expect(pageRenderScale({ unitWidth: 0, unitHeight: 0, cssWidth: 800, dpr: 2 })).toBe(PAGE_RENDER_MIN_SCALE);
  });
  it('treats a missing or nonsense dpr as 1 and clamps a huge one', () => {
    expect(pageRenderScale({ ...A4, cssWidth: 1200, dpr: undefined })).toBeCloseTo(1200 / 595, 5);
    const high = pageRenderScale({ ...A4, cssWidth: 600, dpr: 9 });
    expect(high).toBeCloseTo((600 * MAX_PAGE_RENDER_DPR) / 595, 5);
  });
  it('caps the canvas area so a wide display cannot exhaust memory', () => {
    const s = pageRenderScale({ ...A4, cssWidth: 3000, dpr: 3 });
    expect(A4.unitWidth * s * A4.unitHeight * s).toBeLessThanOrEqual(MAX_PAGE_RENDER_AREA + 1);
  });
  it('keeps a poster inside the cap but never under the floor', () => {
    // A0-ish: even the floor exceeds the cap, the floor still wins (it was the old behaviour)
    expect(pageRenderScale({ unitWidth: 2384, unitHeight: 3370, cssWidth: 800, dpr: 2 })).toBe(PAGE_RENDER_MIN_SCALE);
  });
});

describe('bucketWidth', () => {
  it('rounds up to the bucket so a drag-resize does not repaint every pixel', () => {
    expect(bucketWidth(790)).toBe(Math.ceil(790 / WIDTH_BUCKET_PX) * WIDTH_BUCKET_PX);
    expect(bucketWidth(WIDTH_BUCKET_PX)).toBe(WIDTH_BUCKET_PX);
    expect(bucketWidth(WIDTH_BUCKET_PX + 1)).toBe(2 * WIDTH_BUCKET_PX);
  });
  it('is 0 for an unmeasurable width', () => {
    expect(bucketWidth(0)).toBe(0);
    expect(bucketWidth(NaN)).toBe(0);
  });
});
