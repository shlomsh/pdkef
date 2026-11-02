import { describe, expect, it } from 'vitest';
import { panScroll } from './pan';

describe('panScroll', () => {
  it('moves the scroll against the fingers', () => {
    expect(panScroll({ x: 100, y: 200 }, { x: 30, y: -50 })).toEqual({ x: 70, y: 250 });
  });
  it('stops at the start of the board', () => {
    expect(panScroll({ x: 10, y: 20 }, { x: 80, y: 90 })).toEqual({ x: 0, y: 0 });
  });
  it('stops at the far edge of the column', () => {
    expect(panScroll({ x: 90, y: 480 }, { x: -50, y: -100 }, { x: 100, y: 500 })).toEqual({ x: 100, y: 500 });
  });
  it('without a known range only the start bounds it', () => {
    expect(panScroll({ x: 90, y: 480 }, { x: -50, y: -100 })).toEqual({ x: 140, y: 580 });
  });
});
