import { describe, expect, it } from 'vitest';
import { deletedSummary, isMarqueeDrag, marqueeRect, objectsInMarquee, overlapShare } from './deleteMarquee.ts';
import type { DeletablePdfObject } from './DeletableObjectOverlay.tsx';

const obj = (id: string, left: number, top: number, width = 10, height = 10, kind: 'text' | 'image' = 'text'): DeletablePdfObject =>
  ({ id, pageIndex: 0, kind, rect: { left, top, width, height }, start: 0, end: 1 });

describe('marqueeRect', () => {
  it('normalises any drag direction', () => {
    expect(marqueeRect({ x: 50, y: 40 }, { x: 10, y: 20 })).toEqual({ left: 10, top: 20, width: 40, height: 20 });
  });
});

describe('isMarqueeDrag', () => {
  it('is false up to 5px and true past it', () => {
    expect(isMarqueeDrag(3, 4)).toBe(false);
    expect(isMarqueeDrag(4, 4)).toBe(true);
    expect(isMarqueeDrag(0, 0)).toBe(false);
  });
});

describe('overlapShare', () => {
  it('measures the share of the inner rect inside the outer one', () => {
    const box = { left: 0, top: 0, width: 100, height: 100 };
    expect(overlapShare({ left: 5, top: 5, width: 10, height: 10 }, box)).toBe(1);
    expect(overlapShare({ left: 95, top: 0, width: 10, height: 10 }, box)).toBeCloseTo(0.5);
    expect(overlapShare({ left: 200, top: 0, width: 10, height: 10 }, box)).toBe(0);
    expect(overlapShare({ left: 0, top: 0, width: 0, height: 10 }, box)).toBe(0);
  });
});

describe('objectsInMarquee', () => {
  const rect = { left: 0, top: 0, width: 30, height: 20 };
  it('takes what is at least half inside and leaves a grazed neighbour', () => {
    const inside = obj('a', 5, 5);
    const half = obj('b', 25, 5); // 5 of 10 wide inside
    const graze = obj('c', 28, 5); // 20% inside
    const far = obj('d', 60, 60);
    expect(objectsInMarquee([inside, half, graze, far], rect).map((o) => o.id)).toEqual(['a', 'b']);
  });
  it('skips objects already marked and covers nothing on an empty box', () => {
    const a = obj('a', 5, 5);
    expect(objectsInMarquee([a], rect, 0.5, new Set(['a']))).toEqual([]);
    expect(objectsInMarquee([a], { left: 80, top: 80, width: 5, height: 5 })).toEqual([]);
  });
  it('honours a custom threshold', () => {
    expect(objectsInMarquee([obj('c', 28, 5)], rect, 0.1).map((o) => o.id)).toEqual(['c']);
  });
});

describe('deletedSummary', () => {
  const t = (n: number) => Array.from({ length: n }, () => ({ kind: 'text' as const }));
  const i = (n: number) => Array.from({ length: n }, () => ({ kind: 'image' as const }));
  it('names only text', () => {
    expect(deletedSummary(t(1))).toBe('Deleted text');
    expect(deletedSummary(t(9))).toBe('Deleted 9 pieces of text');
  });
  it('names only images', () => {
    expect(deletedSummary(i(1))).toBe('Deleted an image');
    expect(deletedSummary(i(2))).toBe('Deleted 2 images');
  });
  it('names a mix', () => {
    expect(deletedSummary([...t(9), ...i(2)])).toBe('Deleted 9 pieces of text and 2 images');
    expect(deletedSummary([...t(1), ...i(1)])).toBe('Deleted 1 piece of text and 1 image');
  });
  it('names marks Sign placed (RED-55)', () => {
    const m = (n: number) => Array.from({ length: n }, () => ({ kind: 'mark' as const }));
    expect(deletedSummary(m(1))).toBe('Deleted a mark');
    expect(deletedSummary(m(3))).toBe('Deleted 3 marks');
    expect(deletedSummary([...t(2), ...m(1)])).toBe('Deleted 2 pieces of text and 1 mark');
    expect(deletedSummary([...t(1), ...i(1), ...m(2)])).toBe('Deleted 1 piece of text, 1 image and 2 marks');
  });
});
