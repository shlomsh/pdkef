import { describe, expect, it } from 'vitest';
import { NOTES_W, clampZoom, fitScale, resolveZoom, stepZoom } from './fit';

const page = { width: 612, height: 792, textLeft: 72, textRight: 540 };
const view = { width: 1440, height: 900 };
const r4 = (n: number) => Math.round(n * 10000) / 10000;

describe('fitScale', () => {
  it('fits width, with and without the notes column', () => {
    expect(r4(fitScale('width', page, view, { noted: false }))).toBe(2.3007);
    expect(r4(fitScale('width', page, view, { noted: true }))).toBe(1.6526);
  });
  it('fits text with the notes column as page-space', () => {
    expect(r4(fitScale('text', page, view, { noted: true }))).toBe(1.9027);
    expect(r4(fitScale('page', page, view, { noted: true }))).toBe(1.0253);
  });
  it('fits text', () => {
    expect(r4(fitScale('text', page, view, { noted: false }))).toBe(2.816);
  });
  it('fits page, with the capsule height as an option', () => {
    expect(r4(fitScale('page', page, view, { noted: false }))).toBe(1.0253);
    expect(r4(fitScale('page', page, view, { noted: false, capsuleH: 0 }))).toBe(1.1364);
  });
  it('clamps to the zoom range', () => {
    expect(fitScale('width', page, { width: 4000, height: 900 }, { noted: false })).toBe(3);
  });
  it('lets a fit go below the zoom floor so a wide page still fits a narrow column, and never to nothing', () => {
    expect(fitScale('width', page, { width: 200, height: 900 }, { noted: false })).toBeCloseTo(168 / 612);
    expect(fitScale('width', page, { width: 20, height: 900 }, { noted: false })).toBeGreaterThan(0);
  });
  it('never fits text below width', () => {
    const full = { width: 612, height: 792, textLeft: 0, textRight: 612 };
    expect(fitScale('text', full, view, { noted: false })).toBe(fitScale('width', full, view, { noted: false }));
  });
});

describe('stepZoom', () => {
  it('moves to the next step', () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(1.05, 1)).toBe(1.1);
    expect(stepZoom(1.05, -1)).toBe(1);
  });
  it('clamps at the ends', () => {
    expect(stepZoom(2.9, 1)).toBe(3);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });
});

describe('resolveZoom', () => {
  it('passes numbers through and resolves fit modes', () => {
    expect(resolveZoom(1.5, page, view, { noted: false })).toBe(1.5);
    expect(resolveZoom('width', page, view, { noted: false })).toBe(fitScale('width', page, view, { noted: false }));
  });
});

describe('clampZoom', () => {
  it('clamps to the zoom range', () => {
    expect(clampZoom(0.1)).toBe(0.5);
  });
});

describe('stepZoom from a fit below the floor', () => {
  it('zooming out stays put and zooming in goes to the first step', () => {
    expect(stepZoom(0.45, -1)).toBe(0.45);
    expect(stepZoom(0.45, 1)).toBe(0.5);
  });
});

describe('fitScale with the notes column in px (the normal view)', () => {
  it('leaves NOTES_W px of the width to the notes at Fit width, and Fit text lets them scale with the zoom', () => {
    const opts = { noted: true, notesIn: 'px' as const, pad: 0 };
    expect(fitScale('width', page, view, opts)).toBeCloseTo((1440 - NOTES_W) / 612);
    expect(fitScale('text', page, view, opts)).toBeCloseTo(1440 / (468 + 32 + NOTES_W / ((1440 - NOTES_W) / 612)));
  });
  it('is the plain fit without notes, and page units stay the default', () => {
    expect(fitScale('width', page, view, { noted: false, notesIn: 'px', pad: 0 })).toBeCloseTo(1440 / 612);
    expect(fitScale('width', page, view, { noted: true, pad: 0 })).toBeCloseTo(1440 / (612 + NOTES_W));
  });
  it('Fit text leaves room for the notes as they scale with the chrome in the lamp', () => {
    // TEXT_GUTTER and SIDE_PAD are 16 (private in fit.ts).
    const narrow = { width: 612, height: 792, textLeft: 150, textRight: 460 };
    const opts = { noted: true, notesIn: 'px' as const };
    const v = { width: 800, height: 900 };
    const z = fitScale('text', narrow, v, opts);
    const base = fitScale('width', narrow, v, opts);
    expect(z).toBeGreaterThan(base);
    expect(z * (310 + 32) + NOTES_W * (z / base)).toBeLessThanOrEqual(v.width - 32 + 0.01);
  });
});

describe('a floor above the zoom minimum', () => {
  it('clampZoom raises a zoom to it, and still caps at the maximum', () => {
    expect(clampZoom(0.6, 0.8)).toBe(0.8);
    expect(clampZoom(0.1, 0.8)).toBe(0.8);
    expect(clampZoom(9, 0.8)).toBe(3);
  });
  it('a floor below the minimum lowers it, for a page that needs less than 0.5 to fit', () => {
    expect(clampZoom(0.1, 0.3)).toBe(0.3);
  });
  it('stepZoom lands exactly on the floor when the next step would pass it, then stays', () => {
    expect(stepZoom(1, -1, 0.85)).toBe(0.9);
    expect(stepZoom(0.9, -1, 0.85)).toBe(0.85);
    expect(stepZoom(0.85, -1, 0.85)).toBe(0.85);
  });
  it('stepZoom below the old minimum goes down to a low floor', () => {
    expect(stepZoom(0.5, -1, 0.4)).toBe(0.4);
  });
  it('stepZoom up from the floor takes the next step', () => {
    expect(stepZoom(0.85, 1, 0.85)).toBe(0.9);
  });
  it('resolveZoom floors a numeric setting', () => {
    expect(resolveZoom(0.6, page, view, { noted: false }, 0.9)).toBe(0.9);
  });
});
