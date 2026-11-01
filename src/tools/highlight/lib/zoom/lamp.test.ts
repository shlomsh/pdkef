import { describe, expect, it } from 'vitest';
import { displayZoom, opensLamp } from './lamp.ts';

const page = { width: 600, height: 800, textLeft: 100, textRight: 500 };
const view = { width: 1000, height: 700 };

describe('displayZoom', () => {
  it('is always Fit width outside the lamp, whatever was remembered', () => {
    const fit = (1000 - 32) / 600;
    expect(displayZoom('text', false, page, view)).toBeCloseTo(fit);
    expect(displayZoom(2, false, page, view)).toBeCloseTo(fit);
    expect(displayZoom('page', false, page, view)).toBeCloseTo(fit);
  });
  it('applies the remembered setting inside the lamp', () => {
    expect(displayZoom(2, true, page, view)).toBe(2);
    expect(displayZoom('text', true, page, view)).toBeGreaterThan(displayZoom('width', true, page, view) - 1e-9);
  });
  it('falls back to actual size before the pages are known', () => {
    expect(displayZoom('width', false, undefined, view)).toBeCloseTo(4 / 3);
    expect(displayZoom('width', true, page, { width: 0, height: 0 })).toBeCloseTo(4 / 3);
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
