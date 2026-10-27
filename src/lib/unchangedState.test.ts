import { describe, expect, it } from 'vitest';
import { unlessUnchanged } from './unchangedState.ts';

describe('unlessUnchanged', () => {
  it('keeps the previous object when no field changed', () => {
    const prev = { a: 1, b: 'x' };
    expect(unlessUnchanged(prev, { a: 1, b: 'x' })).toBe(prev);
  });

  it('takes the next object when a field changed', () => {
    const next = { a: 2, b: 'x' };
    expect(unlessUnchanged({ a: 1, b: 'x' }, next)).toBe(next);
  });

  it('compares with Object.is, as useState does', () => {
    const prev = { n: Number.NaN, z: 0 };
    expect(unlessUnchanged(prev, { n: Number.NaN, z: 0 })).toBe(prev);
    const next = { n: Number.NaN, z: -0 };
    expect(unlessUnchanged(prev, next)).toBe(next);
  });

  it('takes the next object when a field was added', () => {
    const next = { a: 1, b: 2 } as { a: number; b?: number };
    expect(unlessUnchanged({ a: 1 } as { a: number; b?: number }, next)).toBe(next);
  });
});
