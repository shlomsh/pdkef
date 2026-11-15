import { describe, expect, it } from 'vitest';
import { leastSquares } from './leastSquares.ts';

describe('leastSquares', () => {
  const ts = Array.from({ length: 20 }, (_, i) => (i + 1) / 21);

  it('recovers an exact line', () => {
    const x = leastSquares(ts, ts.map((t) => 0.3 + 0.7 * t), (t) => [1, t]);
    expect(x![0]).toBeCloseTo(0.3, 9);
    expect(x![1]).toBeCloseTo(0.7, 9);
  });

  it('recovers an exact cubic', () => {
    const x = leastSquares(ts, ts.map((t) => 1 - 2 * t + 3 * t * t - 4 * t ** 3), (t) => [1, t, t * t, t ** 3]);
    [1, -2, 3, -4].forEach((w, i) => expect(x![i]).toBeCloseTo(w, 6));
  });

  it('is null when the basis is singular', () => {
    expect(leastSquares(ts, ts, (t) => [t, 2 * t])).toBeNull();
  });
});
