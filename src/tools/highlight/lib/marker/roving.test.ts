import { describe, expect, it } from 'vitest';
import { nextFocusIndex, nextRadioIndex } from './roving.ts';

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

describe('nextRadioIndex', () => {
  it('moves with all four arrows and wraps at the ends', () => {
    expect(nextRadioIndex(1, 'ArrowRight', 3, false)).toBe(2);
    expect(nextRadioIndex(2, 'ArrowRight', 3, false)).toBe(0);
    expect(nextRadioIndex(2, 'ArrowDown', 3, false)).toBe(0);
    expect(nextRadioIndex(0, 'ArrowLeft', 3, false)).toBe(2);
    expect(nextRadioIndex(0, 'ArrowUp', 3, false)).toBe(2);
  });
  it('reads left and right the other way round in right to left, up and down as they are', () => {
    expect(nextRadioIndex(0, 'ArrowRight', 3, true)).toBe(2);
    expect(nextRadioIndex(0, 'ArrowLeft', 3, true)).toBe(1);
    expect(nextRadioIndex(0, 'ArrowDown', 3, true)).toBe(1);
  });
  it('from no checked radio, forward lands on the first and back on the last', () => {
    expect(nextRadioIndex(-1, 'ArrowRight', 3, false)).toBe(0);
    expect(nextRadioIndex(-1, 'ArrowLeft', 3, false)).toBe(2);
  });
  it('leaves Home, End and any other key to the toolbar, and is null with no radios', () => {
    expect(nextRadioIndex(1, 'Home', 3, false)).toBeNull();
    expect(nextRadioIndex(1, 'End', 3, false)).toBeNull();
    expect(nextRadioIndex(1, 'Enter', 3, false)).toBeNull();
    expect(nextRadioIndex(0, 'ArrowRight', 0, false)).toBeNull();
  });
});
