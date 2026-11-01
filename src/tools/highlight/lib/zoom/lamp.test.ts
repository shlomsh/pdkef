import { describe, expect, it } from 'vitest';
import { displayZoom, opensLamp, widestPage } from './lamp.ts';
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
  const room = 16 * 2 + NOTES_W;
  it('fits the page plus the notes column in the normal view', () => {
    expect(displayZoom('width', false, page, view, true)).toBeCloseTo((1000 - NOTES_W) / 600);
    expect(displayZoom('width', false, page, view, true)).toBeLessThan(displayZoom('width', false, page, view, false));
  });
  it('fits the page plus the notes column in the lamp, for Fit width and Fit text', () => {
    expect(displayZoom('width', true, page, view, true)).toBeCloseTo((1000 - room) / 600);
    expect(displayZoom('text', true, page, view, true)).toBeCloseTo((1000 - room) / (400 + 32));
  });
  it('leaves a numeric zoom alone', () => {
    expect(displayZoom(2, true, page, view, true)).toBe(2);
    expect(displayZoom(1.25, true, page, view, false)).toBe(1.25);
  });
});

describe('opensLamp', () => {
  it('opens on a ctrl wheel and on a zoom key, nothing else', () => {
    expect(opensLamp({ type: 'wheel', ctrlKey: true })).toBe(true);
    expect(opensLamp({ type: 'wheel', ctrlKey: false })).toBe(false);
    expect(opensLamp({ type: 'key', action: { type: 'zoom', dir: 1 } })).toBe(true);
    expect(opensLamp({ type: 'key', action: { type: 'zoomActual' } })).toBe(true);
    expect(opensLamp({ type: 'key', action: { type: 'undo' } })).toBe(false);
    expect(opensLamp({ type: 'key', action: null })).toBe(false);
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
