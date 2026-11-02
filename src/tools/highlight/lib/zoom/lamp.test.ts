import { describe, expect, it } from 'vitest';
import { chromeScale, displayZoom, isZoomInput, lampFloor, widestPage } from './lamp.ts';
import { NOTES_W, ZOOM_MIN, fitScale } from './fit.ts';
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
  it('fits the page beside NOTES_W px in the lamp at Fit width, and Fit text leaves room for the notes as they scale', () => {
    const base = (1000 - 32 - NOTES_W) / 600;
    expect(displayZoom('width', true, page, view, true)).toBeCloseTo(base);
    expect(displayZoom('text', true, page, view, true)).toBeCloseTo((1000 - 32) / (400 + 32 + NOTES_W / base));
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
    expect(isZoomInput({ type: 'key', action: { type: 'comment' } })).toBe(false);
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

describe('lampFloor', () => {
  const pg = { width: 612, height: 792, textLeft: 72, textRight: 540 };
  const v = { width: 400, height: 800 };
  it('is the whole-page fit, with or without the notes column', () => {
    expect(lampFloor(pg, v, false)).toBeCloseTo(fitScale('page', pg, v, { noted: false, notesIn: 'px' }));
    expect(lampFloor(pg, v, true)).toBeLessThan(lampFloor(pg, v, false));
  });
  it('can be below the old 0.5 minimum', () => {
    expect(lampFloor(pg, v, false)).toBeLessThan(0.65);
    expect(lampFloor(pg, { width: 200, height: 800 }, false)).toBeLessThan(0.5);
  });
  it('is the old minimum until a page is measured', () => {
    expect(lampFloor(undefined, v, false)).toBe(ZOOM_MIN);
    expect(lampFloor(pg, { width: 0, height: 0 }, false)).toBe(ZOOM_MIN);
  });
  it('floors a saved numeric zoom in the lamp', () => {
    expect(displayZoom(0.5, true, pg, { width: 800, height: 1000 }, false)).toBeCloseTo(lampFloor(pg, { width: 800, height: 1000 }, false));
  });
});
