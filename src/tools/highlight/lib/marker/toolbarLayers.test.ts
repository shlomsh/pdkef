import { describe, expect, it } from 'vitest';
import { scrolledPast } from './toolbarLayers.ts';

describe('scrolledPast', () => {
  it('is true only beyond 24 px either way', () => {
    expect(scrolledPast(100, 124)).toBe(false);
    expect(scrolledPast(100, 125)).toBe(true);
    expect(scrolledPast(100, 75)).toBe(true);
    expect(scrolledPast(100, 76)).toBe(false);
  });
});
