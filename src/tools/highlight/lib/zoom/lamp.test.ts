import { describe, expect, it } from 'vitest';
import { chromeScale, displayZoom, isZoomInput, widestPage } from './lamp.ts';
import { NOTES_W } from './fit.ts';
import { turnedPageBox } from './turnedBox.ts';

const page = { width: 600, height: 800, textLeft: 100, textRight: 500 };
const view = { width: 1000, height: 700 };

describe('displayZoom', () => {
  it('is always Fit width outside the lamp, whatever was remembered, filling the workspace (it sits inside the card gutters already)', () => {
    const fit = 1000 / 600;
    expect(displayZoom('text', false, page, view, false)).toBeCloseTo(fit);
    expect(displayZoom(2, false, page, view, false)).toBeCloseTo(fit);
    expect(displayZoom('page', false, page, view, false)).toBeCloseTo(fit);
  });
  it('applies the remembered setting inside the lamp', () => {
    expect(displayZoom(2, true, page, view, false)).toBe(2);
    expect(displayZoom('text', true, page, view, false)).toBeGreaterThan(displayZoom('width', true, page, view, false) - 1e-9);
  });
  it('falls back to actual size before the pages are known', () => {
    expect(displayZoom('width', false, undefined, view, false)).toBeCloseTo(4 / 3);
    expect(displayZoom('width', true, page, { width: 0, height: 0 }, false)).toBeCloseTo(4 / 3);
  });
});

describe('displayZoom with notes', () => {
  it('fits the page beside a notes column of NOTES_W px in the normal view', () => {
    expect(displayZoom('width', false, page, view, true)).toBeCloseTo((1000 - NOTES_W) / 600);
    expect(displayZoom('width', false, page, view, true)).toBeLessThan(displayZoom('width', false, page, view, false));
  });
  it('fits the page beside NOTES_W px in the lamp too, for Fit width and Fit text (the normal view proportions)', () => {
    expect(displayZoom('width', true, page, view, true)).toBeCloseTo((1000 - 32 - NOTES_W) / 600);
    expect(displayZoom('text', true, page, view, true)).toBeCloseTo((1000 - 32 - NOTES_W) / (400 + 32));
  });
  it('leaves a numeric zoom alone', () => {
    expect(displayZoom(2, true, page, view, true)).toBe(2);
    expect(displayZoom(1.25, true, page, view, false)).toBe(1.25);
  });
});

describe('chromeScale', () => {
  const wide = { width: 1440, height: 800 };
  const big = { width: 600, height: 800, textLeft: 0, textRight: 600 };
  it('is 1 in the normal view', () => {
    expect(chromeScale(1.7, false, big, wide, true)).toBe(1);
  });
  it('is 1 at the lamp Fit width with notes, which leaves the page 1440 - 2*pad - 240', () => {
    const z = displayZoom('width', true, big, wide, true);
    expect(big.width * z).toBeCloseTo(1440 - 32 - NOTES_W);
    expect(chromeScale(z, true, big, wide, true)).toBeCloseTo(1);
  });
  it('is 2 at twice that zoom', () => {
    const z = displayZoom('width', true, big, wide, true);
    expect(chromeScale(2 * z, true, big, wide, true)).toBeCloseTo(2);
  });
  it('is 1 at the lamp Fit width without notes', () => {
    expect(chromeScale(displayZoom('width', true, big, wide, false), true, big, wide, false)).toBeCloseTo(1);
  });
  it('is 1 with no page or no width', () => {
    expect(chromeScale(2, true, undefined, wide, true)).toBe(1);
    expect(chromeScale(2, true, big, { width: 0, height: 0 }, true)).toBe(1);
  });
});

describe('isZoomInput', () => {
  it('is a ctrl wheel or a zoom key, nothing else', () => {
    expect(isZoomInput({ type: 'wheel', ctrlKey: true })).toBe(true);
    expect(isZoomInput({ type: 'wheel', ctrlKey: false })).toBe(false);
    expect(isZoomInput({ type: 'key', action: { type: 'zoom', dir: 1 } })).toBe(true);
    expect(isZoomInput({ type: 'key', action: { type: 'zoomActual' } })).toBe(true);
    expect(isZoomInput({ type: 'key', action: { type: 'undo' } })).toBe(false);
    expect(isZoomInput({ type: 'key', action: null })).toBe(false);
  });
});

describe('widestPage', () => {
  it('is the page a fit sizes by, so a wider later page never overflows the view', () => {
    const pages = [
      { width: 523, height: 744, textLeft: 0, textRight: 523 },
      { width: 544, height: 742, textLeft: 0, textRight: 544 },
      { width: 515, height: 735, textLeft: 0, textRight: 515 },
    ];
    const zoom = displayZoom('width', false, widestPage(pages), view, false);
    expect(Math.max(...pages.map((p) => p.width)) * zoom).toBeLessThanOrEqual(view.width + 1e-9);
  });
  it('is undefined before the pages are measured', () => {
    expect(widestPage([])).toBeUndefined();
  });
});

describe('displayZoom with a turned page', () => {
  const phone = { width: 402, height: 874 };
  it('sizes a 595x842 page turned a quarter in a 402px column no wider than the column, in the normal view and the lamp', () => {
    const turned = turnedPageBox({ width: 595, height: 842 }, 1, null);
    const widest = widestPage([turned])!;
    expect(widest.width * displayZoom('width', false, widest, phone, false)).toBeLessThanOrEqual(402 + 1e-9);
    expect(widest.width * displayZoom('width', true, widest, phone, false)).toBeLessThanOrEqual(402 + 16 * 2);
  });
  it('keeps an upright page at the same fit as before', () => {
    expect(displayZoom('width', false, { width: 595, height: 842, textLeft: 0, textRight: 595 }, phone, false)).toBeCloseTo(402 / 595);
  });
});
