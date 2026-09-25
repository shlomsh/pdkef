import { describe, expect, it } from 'vitest';
import { isFillMode } from './fillMode.ts';

describe('isFillMode', () => {
  it('is true for ?next=1', () => {
    expect(isFillMode('?next=1')).toBe(true);
  });

  it('is true without a leading ?', () => {
    expect(isFillMode('next=1')).toBe(true);
  });

  it('is true alongside other params', () => {
    expect(isFillMode('?lang=he&next=1')).toBe(true);
  });

  it('is false with no query string at all', () => {
    expect(isFillMode('')).toBe(false);
  });

  it('is false when next is absent', () => {
    expect(isFillMode('?lang=he')).toBe(false);
  });

  it('is false for any value other than exactly "1"', () => {
    expect(isFillMode('?next=true')).toBe(false);
    expect(isFillMode('?next=0')).toBe(false);
    expect(isFillMode('?next=')).toBe(false);
    expect(isFillMode('?next')).toBe(false);
  });

  it('reads the first value when next appears twice', () => {
    expect(isFillMode('?next=0&next=1')).toBe(false);
    expect(isFillMode('?next=1&next=0')).toBe(true);
  });
});
