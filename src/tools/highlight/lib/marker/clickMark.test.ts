import { describe, expect, it } from 'vitest';
import { clickMarkElement, planClick } from './clickMark.ts';
import { DEFAULT_MARKER } from './markerState.ts';

const base = { detail: 2, pageKind: 'text' as const, inks: [] as string[], overId: null as string | null, sequence: null };

describe('planClick (R10 to R12)', () => {
  it('a single click does nothing', () => {
    expect(planClick({ ...base, detail: 1 })).toBeNull();
  });

  it('a double-click takes the word', () => {
    expect(planClick(base)).toEqual({ unit: 'word', replaceIds: [] });
  });

  it('a third click takes the sentence on a text page and the line on a scan', () => {
    expect(planClick({ ...base, detail: 3 })).toEqual({ unit: 'sentence', replaceIds: [] });
    expect(planClick({ ...base, detail: 3, pageKind: 'scan' })).toEqual({ unit: 'line', replaceIds: [] });
  });

  it('replaces the ink the presses laid, so a drifted double-click never adds a second mark', () => {
    expect(planClick({ ...base, inks: ['a', 'b'] })).toEqual({ unit: 'word', replaceIds: ['a', 'b'] });
  });

  it('never removes an existing highlight: a double-click over one does nothing', () => {
    expect(planClick({ ...base, overId: 'old', inks: [] })).toBeNull();
  });

  it('the ink this click laid is not an existing highlight', () => {
    expect(planClick({ ...base, overId: 'b', inks: ['b'] })).toEqual({ unit: 'word', replaceIds: ['b'] });
  });

  it('a third click over the word the double-click laid grows it to the sentence', () => {
    const plan = planClick({ ...base, detail: 3, overId: 'w', sequence: { id: 'w', unit: 'word' } });
    expect(plan).toEqual({ unit: 'sentence', replaceIds: ['w'] });
  });

  it('a double-click over the previous sequence mark is still an existing highlight', () => {
    expect(planClick({ ...base, detail: 2, overId: 'w', sequence: { id: 'w', unit: 'sentence' } })).toBeNull();
  });

  it('a further click that would lay the same unit again does nothing', () => {
    expect(planClick({ ...base, detail: 4, overId: 's', sequence: { id: 's', unit: 'sentence' } })).toBeNull();
  });

  it('a third click away from the sequence mark over another highlight does nothing', () => {
    expect(planClick({ ...base, detail: 3, overId: 'other', sequence: { id: 'w', unit: 'word' } })).toBeNull();
  });
});

describe('clickMarkElement', () => {
  const boxes = [{ left: 10, top: 20, width: 30, height: 2 }, { left: 10, top: 24, width: 50, height: 2 }];

  it('is one highlight whose bands are the boxes, in percent of its own box', () => {
    const el = clickMarkElement({ id: 'x', pageIndex: 2, boxes, marker: DEFAULT_MARKER, direction: 'ltr' })!;
    expect(el).toMatchObject({ id: 'x', type: 'highlight', pageIndex: 2, left: 10, top: 20, width: 50, height: 6, color: DEFAULT_MARKER.color });
    expect(el.bands).toHaveLength(2);
    expect(el.bands[0]).toEqual({ left: 0, top: 0, width: 60, height: expect.closeTo(33.33, 1) });
    expect(el.style).toBeUndefined();
    expect(el.opacity).toBeUndefined();
    expect(el.direction).toBeUndefined();
  });

  it('carries the armed underline and opacity, and a right to left direction', () => {
    const el = clickMarkElement({ id: 'x', pageIndex: 0, boxes, marker: { color: '#FF8FCF', style: 'underline', opacity: 0.5 }, direction: 'rtl' })!;
    expect(el).toMatchObject({ color: '#FF8FCF', style: 'underline', opacity: 0.5, direction: 'rtl' });
  });

  it('is null for no boxes or boxes with no area', () => {
    expect(clickMarkElement({ id: 'x', pageIndex: 0, boxes: [], marker: DEFAULT_MARKER, direction: 'ltr' })).toBeNull();
    expect(clickMarkElement({ id: 'x', pageIndex: 0, boxes: [{ left: 1, top: 1, width: 0, height: 2 }], marker: DEFAULT_MARKER, direction: 'ltr' })).toBeNull();
  });
});
