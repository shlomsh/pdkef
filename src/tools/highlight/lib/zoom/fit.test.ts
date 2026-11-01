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
  it('leaves NOTES_W px of the width to the notes, and fits the page in the rest', () => {
    const opts = { noted: true, notesIn: 'px' as const, pad: 0 };
    expect(fitScale('width', page, view, opts)).toBeCloseTo((1440 - NOTES_W) / 612);
    expect(fitScale('text', page, view, opts)).toBeCloseTo((1440 - NOTES_W) / (468 + 32));
  });
  it('is the plain fit without notes, and page units stay the default', () => {
    expect(fitScale('width', page, view, { noted: false, notesIn: 'px', pad: 0 })).toBeCloseTo(1440 / 612);
    expect(fitScale('width', page, view, { noted: true, pad: 0 })).toBeCloseTo(1440 / (612 + NOTES_W));
  });
});
