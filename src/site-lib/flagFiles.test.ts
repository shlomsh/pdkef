import { describe, expect, it } from 'vitest';
import { flagSpriteFor } from './flagFiles';

describe('flagFiles', () => {
  it('keeps the distinct countries that have a flag file, sorted, and drops the rest', () => {
    expect(flagSpriteFor([{ country: 'KE' }, { country: 'IN' }, { country: 'KE' }, { country: 'XX' }, {}])?.codes).toEqual(['IN', 'KE']);
  });

  it('reads real files that make a sprite with one view each', () => {
    const svg = flagSpriteFor([{ country: 'IN' }, { country: 'ES' }, { country: 'BD' }])?.svg ?? '';
    expect([...svg.matchAll(/<view id="([A-Z]+)"/g)].map((m) => m[1])).toEqual(['BD', 'ES', 'IN']);
  });

  it('publishes no sprite when no note has a flag', () => {
    expect(flagSpriteFor([])).toBeNull();
    expect(flagSpriteFor([{ country: 'XX' }, {}])).toBeNull();
  });

  it('names the sprite by the flags the notes ask for, whatever their order or repeats', () => {
    const a = flagSpriteFor([{ country: 'KE' }, { country: 'IN' }, { country: 'KE' }]);
    expect(a?.codes).toEqual(['IN', 'KE']);
    expect(flagSpriteFor([{ country: 'IN' }, { country: 'KE' }])?.url).toBe(a?.url);
    expect(flagSpriteFor([{ country: 'IN' }, { country: 'ES' }])?.url).not.toBe(a?.url);
  });
});
