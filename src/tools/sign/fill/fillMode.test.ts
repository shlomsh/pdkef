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

  it('is true with no query string at all (fill mode is the default)', () => {
    expect(isFillMode('')).toBe(true);
  });

  it('is true when next is absent', () => {
    expect(isFillMode('?lang=he')).toBe(true);
  });

  it('is true for any value other than exactly "0"', () => {
    expect(isFillMode('?next=true')).toBe(true);
    expect(isFillMode('?next=1')).toBe(true);
    expect(isFillMode('?next=')).toBe(true);
    expect(isFillMode('?next')).toBe(true);
  });

  it('is false for exactly ?next=0 (keeps the old editor)', () => {
    expect(isFillMode('?next=0')).toBe(false);
  });

  it('reads the first value when next appears twice', () => {
    expect(isFillMode('?next=0&next=1')).toBe(false);
    expect(isFillMode('?next=1&next=0')).toBe(true);
  });
});
