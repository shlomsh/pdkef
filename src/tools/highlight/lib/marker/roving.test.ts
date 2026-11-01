import { describe, expect, it } from 'vitest';
import { nextFocusIndex } from './roving.ts';

describe('nextFocusIndex', () => {
  it('moves one step with the arrow keys and stops at the ends', () => {
    expect(nextFocusIndex(1, 'ArrowRight', 4, false)).toBe(2);
    expect(nextFocusIndex(1, 'ArrowLeft', 4, false)).toBe(0);
    expect(nextFocusIndex(0, 'ArrowLeft', 4, false)).toBe(0);
    expect(nextFocusIndex(3, 'ArrowRight', 4, false)).toBe(3);
  });
  it('reads the arrows the other way round in right to left', () => {
    expect(nextFocusIndex(1, 'ArrowRight', 4, true)).toBe(0);
    expect(nextFocusIndex(1, 'ArrowLeft', 4, true)).toBe(2);
  });
  it('Home and End jump to the ends', () => {
    expect(nextFocusIndex(2, 'Home', 4, false)).toBe(0);
    expect(nextFocusIndex(1, 'End', 4, false)).toBe(3);
  });
  it('is null for any other key or an empty toolbar', () => {
    expect(nextFocusIndex(1, 'ArrowDown', 4, false)).toBeNull();
    expect(nextFocusIndex(0, 'ArrowRight', 0, false)).toBeNull();
  });
});
