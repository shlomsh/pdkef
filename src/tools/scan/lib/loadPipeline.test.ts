import { describe, expect, it, vi } from 'vitest';

// EDGE: the pipeline decodes photos and draws canvases (createImageBitmap, 2d context), which node does not have.
vi.mock('./scanPipeline.ts', () => ({ guessPage: vi.fn() }));

describe('loadPipeline', () => {
  it('loads the pipeline once and hands every caller the same promise', async () => {
    const { loadPipeline } = await import('./loadPipeline.ts');
    const first = loadPipeline();
    expect(loadPipeline()).toBe(first);
    expect(await first).toHaveProperty('guessPage');
  });
});
