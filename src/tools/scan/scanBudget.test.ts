import { describe, expect, it, vi } from 'vitest';
import { SCAN_QUALITY, SCAN_SCALE_LADDER, SIZE_LIMITS, fitScanToBudget } from './scanBudget.ts';

// A fake build whose size is a known function of scale and quality: three pages
// of 400 KB each at full scale and the no-limit quality, shrinking with area and quality.
const sizeOf = (scale: number, quality: number) => Math.round(3 * 400_000 * scale * scale * (quality / SCAN_QUALITY));
const fakeInput = (budgetBytes: number | null) => {
  const render = vi.fn((scale: number) => ({ scale }));
  const build = vi.fn(async (handle: { scale: number }, quality: number) => new Blob([new Uint8Array(sizeOf(handle.scale, quality))]));
  const release = vi.fn();
  return { budgetBytes, render, build, release, deadlineMs: Number.POSITIVE_INFINITY };
};

describe('fitScanToBudget', () => {
  it('with no limit builds once, at full scale and the default quality', async () => {
    const input = fakeInput(null);
    const result = await fitScanToBudget(input);
    expect(input.render).toHaveBeenCalledTimes(1);
    expect(input.build).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ metTarget: true, scale: 1, quality: SCAN_QUALITY });
    expect(result.blob.size).toBe(sizeOf(1, SCAN_QUALITY));
  });

  it('keeps the no-limit result when it already fits', async () => {
    const input = fakeInput(2 * 1024 * 1024);
    const result = await fitScanToBudget(input);
    expect(input.build).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ metTarget: true, scale: 1, quality: SCAN_QUALITY });
  });

  it('steps quality down first, then scale, until the PDF fits under 1 MB', async () => {
    const budget = 1024 * 1024;
    const input = fakeInput(budget);
    const result = await fitScanToBudget(input);
    expect(result.metTarget).toBe(true);
    expect(result.blob.size).toBeLessThanOrEqual(budget);
    // 1.2 MB at full scale needs only a lower quality, not a smaller scale.
    expect(result.scale).toBe(1);
    expect(result.quality).toBeLessThan(SCAN_QUALITY);
  });

  it('drops resolution when quality alone cannot reach the limit', async () => {
    const budget = 200 * 1024;
    const input = fakeInput(budget);
    const result = await fitScanToBudget(input);
    expect(result.metTarget).toBe(true);
    expect(result.blob.size).toBeLessThanOrEqual(budget);
    expect(result.scale).toBeLessThan(1);
    expect(SCAN_SCALE_LADDER).toContain(result.scale);
  });

  it('says so, and returns the smallest it made, when nothing fits', async () => {
    const input = fakeInput(1000);
    const result = await fitScanToBudget(input);
    expect(result.metTarget).toBe(false);
    const smallest = Math.min(...(await Promise.all(input.build.mock.results.map((r) => r.value))).map((b: Blob) => b.size));
    expect(result.blob.size).toBe(smallest);
  });

  it('releases every rendered set of pages', async () => {
    const input = fakeInput(200 * 1024);
    await fitScanToBudget(input);
    const rendered = input.render.mock.results.map((r) => r.value);
    for (const handle of rendered) expect(input.release).toHaveBeenCalledWith(handle);
  });
});

describe('SIZE_LIMITS', () => {
  it('offers no limit, 2 MB, 1 MB and 500 KB, in that order', () => {
    expect(SIZE_LIMITS.map((limit) => [limit.id, limit.bytes])).toEqual([
      ['none', null], ['2mb', 2 * 1024 * 1024], ['1mb', 1024 * 1024], ['500kb', 500 * 1024],
    ]);
  });
});
