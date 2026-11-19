import { describe, expect, it } from 'vitest';

describe('loadPipeline', () => {
  it('loads the pipeline once and hands every caller the same promise', async () => {
    const { loadPipeline } = await import('./loadPipeline.ts');
    const first = loadPipeline();
    expect(loadPipeline()).toBe(first);
    expect(await first).toHaveProperty('guessPage');
  });
});
