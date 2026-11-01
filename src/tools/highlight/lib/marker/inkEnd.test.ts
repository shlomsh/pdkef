import { describe, expect, it } from 'vitest';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { inkEnd, placeBar } from './inkEnd.ts';

const base: HighlightElement = {
  id: 'h', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 40, height: 10, color: '#FFF34D',
  bands: [
    { left: 0, top: 0, width: 100, height: 40 },
    { left: 0, top: 60, width: 50, height: 40 },
  ],
};

describe('inkEnd', () => {
  it('is the right edge of the last band in left to right text', () => {
    expect(inkEnd(base)).toEqual({ x: 30, top: 26, bottom: 30 });
  });
  it('is the left edge of the last band in right to left text', () => {
    expect(inkEnd({ ...base, direction: 'rtl', bands: [{ left: 20, top: 60, width: 80, height: 40 }] })).toEqual({ x: 18, top: 26, bottom: 30 });
  });
  it('falls back to the element box when it has no bands', () => {
    expect(inkEnd({ ...base, bands: [] })).toEqual({ x: 50, top: 20, bottom: 30 });
  });
});

const area = { vw: 1000, vh: 800, topMin: 8, barW: 100, barMaxW: 300, barH: 34 };

describe('placeBar', () => {
  it('sits above the line, centred on its end, when there is room', () => {
    expect(placeBar({ ...area, x: 500, lineTop: 300, lineBottom: 320, rtl: false })).toEqual({ side: 'above', top: 260, edge: 450, align: 'left' });
  });
  it('drops below the line when above is out of room', () => {
    expect(placeBar({ ...area, x: 500, lineTop: 20, lineBottom: 40, rtl: false })).toMatchObject({ side: 'below', top: 46 });
  });
  it('keeps the grown bar inside the screen', () => {
    expect(placeBar({ ...area, x: 950, lineTop: 300, lineBottom: 320, rtl: false }).edge).toBe(692);
    expect(placeBar({ ...area, x: 10, lineTop: 300, lineBottom: 320, rtl: false }).edge).toBe(8);
  });
  it('never leaves the bottom of the screen', () => {
    expect(placeBar({ ...area, x: 500, lineTop: 5, lineBottom: 790, rtl: false }).top).toBe(758);
  });
  it('anchors the right edge in right to left text', () => {
    expect(placeBar({ ...area, x: 500, lineTop: 300, lineBottom: 320, rtl: true })).toEqual({ side: 'above', top: 260, edge: 550, align: 'right' });
    expect(placeBar({ ...area, x: 50, lineTop: 300, lineBottom: 320, rtl: true }).edge).toBe(308);
  });
});
