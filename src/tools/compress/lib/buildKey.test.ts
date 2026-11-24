import { describe, expect, it } from 'vitest';
import { buildKey } from './buildKey.ts';

describe('buildKey', () => {
  it('gives the same key for the same inputs', () => {
    expect(buildKey(3, 'medium', 100, false)).toBe(buildKey(3, 'medium', 100, false));
  });

  it('gives a different key when any one input differs', () => {
    const base = buildKey(1, 'medium', 100, false);
    expect(buildKey(2, 'medium', 100, false)).not.toBe(base);
    expect(buildKey(1, 'high', 100, false)).not.toBe(base);
    expect(buildKey(1, 'medium', 200, false)).not.toBe(base);
    expect(buildKey(1, 'medium', 100, true)).not.toBe(base);
  });
});
