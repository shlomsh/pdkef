import { describe, expect, it } from 'vitest';
import { flagCodesOf, readFlagFiles } from './flagFiles';
import { flagSprite } from './flagSprite';

describe('flagFiles', () => {
  it('keeps the distinct countries that have a flag file, sorted, and drops the rest', () => {
    expect(flagCodesOf([{ country: 'KE' }, { country: 'IN' }, { country: 'KE' }, { country: 'XX' }, {}])).toEqual(['IN', 'KE']);
    expect(flagCodesOf([])).toEqual([]);
  });

  it('reads real files that make a sprite with one view each', () => {
    const svg = flagSprite(readFlagFiles(['IN', 'ES', 'BD']));
    expect([...svg.matchAll(/<view id="([A-Z]+)"/g)].map((m) => m[1])).toEqual(['BD', 'ES', 'IN']);
  });
});
