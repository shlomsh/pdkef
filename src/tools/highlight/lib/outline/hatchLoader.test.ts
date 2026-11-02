import { describe, expect, it } from 'vitest';
import { hatchIfLoaded, loadHatch } from './hatchLoader.ts';

describe('READ-14: hatchLoader', () => {
  it('has nothing until the first load, then hands the same module to everyone', async () => {
    expect(hatchIfLoaded()).toBeNull();
    const first = await loadHatch();
    expect(typeof first.hatchOps).toBe('function');
    expect(hatchIfLoaded()).toBe(first);
    expect(await loadHatch()).toBe(first);
  });
});
