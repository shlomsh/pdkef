import { describe, expect, it } from 'vitest';
import { anchoredScroll } from './anchor';

describe('anchoredScroll', () => {
  it('keeps the content under the anchor still', () => {
    expect(anchoredScroll({ zoom: 1, scroll: { x: 0, y: 0 }, origin: { x: 16, y: 0 } }, 2, { x: 500, y: 300 })).toEqual({ x: 484, y: 300 });
    expect(anchoredScroll({ zoom: 1, scroll: { x: 0, y: 1000 }, origin: { x: 16, y: 0 } }, 2, { x: 500, y: 300 })).toEqual({ x: 484, y: 2300 });
  });
});
