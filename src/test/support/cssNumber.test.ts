import { describe, it, expect } from 'vitest';
import { cssNumber } from './cssNumber.ts';

describe('cssNumber', () => {
  it('keeps six significant digits, as jsdom serializes a style number', () => {
    expect(cssNumber((1 / 6) * 100)).toBe('16.6667');
    expect(cssNumber(9.439999999999998)).toBe('9.44');
  });

  it('leaves a short number as it is', () => {
    expect(cssNumber(50)).toBe('50');
    expect(cssNumber(0.18)).toBe('0.18');
  });
});
