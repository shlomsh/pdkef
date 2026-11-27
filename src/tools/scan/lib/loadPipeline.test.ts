import { describe, expect, it } from 'vitest';
import { loadPipeline } from './loadPipeline.ts';

describe('loadPipeline', () => {
  it('loads the pipeline once and hands every caller the same promise', async () => {
    const first = loadPipeline();
    expect(loadPipeline()).toBe(first);
    expect(await first).toHaveProperty('guessPage');
  });
});
