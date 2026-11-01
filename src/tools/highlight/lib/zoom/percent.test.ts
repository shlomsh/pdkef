import { describe, expect, it } from 'vitest';
import { ACTUAL_SIZE, zoomPercent } from './percent.ts';

describe('zoomPercent', () => {
  it('reads actual size as 100%', () => {
    expect(zoomPercent(ACTUAL_SIZE)).toBe(100);
    expect(zoomPercent(2)).toBe(150);
  });
});
