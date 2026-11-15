import { describe, expect, it } from 'vitest';
import { CORNER_RAMP, sideAt } from './types.ts';

describe('sideAt', () => {
  it('a line is zero at both corners and e + f t between the ramps', () => {
    const s = { a: 0, b: 0, line: { e: 0.01, f: 0.02 } };
    expect(sideAt(s, 0)).toBe(0);
    expect(sideAt(s, 1)).toBe(0);
    for (const t of [CORNER_RAMP, 0.3, 0.5, 1 - CORNER_RAMP]) expect(sideAt(s, t)).toBeCloseTo(0.01 + 0.02 * t, 12);
    expect(sideAt(s, CORNER_RAMP / 2)).toBeCloseTo((0.01 + 0.02 * (CORNER_RAMP / 2)) / 2, 12);
  });

  it('a line stays zero past the corners, where a bend can carry the map a little outside the page', () => {
    const s = { a: 0, b: 0, line: { e: 0.01, f: 0.02 } };
    for (const t of [-0.05, -0.001, 1.001, 1.05]) expect(sideAt(s, t)).toBe(0);
  });

  it('a kink is by at the kink, zero at both ends, and straight on each piece', () => {
    const s = { a: 0, b: 0, kink: { at: 0.4, by: 0.01 } };
    expect(sideAt(s, 0.4)).toBeCloseTo(0.01, 12);
    expect(sideAt(s, 0)).toBe(0);
    expect(sideAt(s, 1)).toBe(0);
    expect(sideAt(s, 0.2)).toBeCloseTo(0.005, 12);
    expect(sideAt(s, 0.7)).toBeCloseTo(0.005, 12);
  });
});
