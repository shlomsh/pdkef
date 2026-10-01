import { describe, expect, it } from 'vitest';
import { EVERY_PAGE_MESSAGE, restOfImage, sharedImageMessage } from './sameImage.ts';
import type { DeletablePdfObject } from './DeletableObjectOverlay.tsx';

const img = (id: string, pageIndex: number, imageRef?: string, kind: 'image' | 'text' = 'image'): DeletablePdfObject =>
  ({ id, pageIndex, kind, imageRef, rect: { left: 0, top: 0, width: 10, height: 10 }, start: 0, end: 1 });

describe('restOfImage', () => {
  const all = [img('a', 0, '5 0 R'), img('b', 1, '5 0 R'), img('c', 2, '5 0 R'), img('d', 1, '6 0 R'), img('t', 1, undefined, 'text')];

  it('finds the other unmarked draws of the same image', () => {
    const { rest, otherPages } = restOfImage(all, new Set(), all[0]);
    expect(rest.map((o) => o.id)).toEqual(['b', 'c']);
    expect(otherPages).toBe(2);
  });

  it('skips draws already marked for deletion', () => {
    const { rest, otherPages } = restOfImage(all, new Set(['b']), all[0]);
    expect(rest.map((o) => o.id)).toEqual(['c']);
    expect(otherPages).toBe(1);
  });

  it('offers nothing for text, an image without a ref, or a lone draw', () => {
    expect(restOfImage(all, new Set(), all[4]).rest).toEqual([]);
    expect(restOfImage([img('x', 0)], new Set(), img('x', 0)).rest).toEqual([]);
    expect(restOfImage(all, new Set(), all[3]).otherPages).toBe(0);
  });

  it('counts pages, not draws, and ignores a second draw on the same page', () => {
    const two = [img('a', 0, 'r'), img('a2', 0, 'r'), img('b', 1, 'r'), img('b2', 1, 'r')];
    const { rest, otherPages } = restOfImage(two, new Set(), two[0]);
    expect(rest).toHaveLength(3);
    expect(otherPages).toBe(1);
  });
});

describe('messages', () => {
  it('says page for one and pages for more', () => {
    expect(sharedImageMessage(1)).toBe('Deleted an image, also on 1 other page');
    expect(sharedImageMessage(4)).toBe('Deleted an image, also on 4 other pages');
    expect(EVERY_PAGE_MESSAGE).toBe('Deleted the image on every page');
  });
});
