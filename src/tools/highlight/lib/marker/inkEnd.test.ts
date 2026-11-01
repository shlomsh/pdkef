import { describe, expect, it } from 'vitest';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { inkEnd } from './inkEnd.ts';

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
