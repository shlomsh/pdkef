import { describe, expect, it, vi } from 'vitest';
import { searchTargetSize } from './targetSizeSearch.js';

// A fake encoder whose size is a known function of scale and quality, so
// assertions can predict the exact outcome instead of just "it ran".
// Bigger scale and higher quality both produce a bigger (worse-compressed)
// result, mirroring a real canvas/JPEG encoder.
function sizeFor(scale, quality) {
  return Math.round(scale * quality * 1000);
}

function makeEncoder() {
  const calls = [];
  const encode = vi.fn((handle, quality) => {
    calls.push({ scale: handle.scale, quality });
    return Promise.resolve({ size: sizeFor(handle.scale, quality) });
  });
  return { encode, calls };
}

describe('searchTargetSize', () => {
  it('picks the highest quality at the first scale that fits the budget', async () => {
    const { encode } = makeEncoder();
    const renderAtScale = vi.fn((scale) => ({ scale }));

    const result = await searchTargetSize({
      scales: [1, 0.5, 0.25],
      renderAtScale,
      encode,
      budgetBytes: 500, // scale 1 at quality ~0.5 lands here
      minQuality: 0.05,
      maxQuality: 1,
      qualitySteps: 20,
      deadlineMs: Date.now() + 10000,
    });

    // Only the first scale should have been rendered - it fits, so the
    // search never drops to a lower one.
    expect(renderAtScale).toHaveBeenCalledTimes(1);
    expect(result.scale).toBe(1);
    expect(result.encoded.size).toBeLessThanOrEqual(500);
    // With enough steps the binary search should land close to the budget,
    // i.e. quality close to 0.5 (size = 1 * quality * 1000 <= 500).
    expect(result.quality).toBeGreaterThan(0.45);
    expect(result.quality).toBeLessThanOrEqual(0.5 + 0.01);
  });

  it('drops down the scale ladder when a higher scale cannot fit even at minimum quality', async () => {
    const { encode } = makeEncoder();
    const renderAtScale = vi.fn((scale) => ({ scale }));

    // At minQuality 0.1: scale 1 -> size 100 (fits under budget 90? no,
    // pick budget so scale 1 floor doesn't fit but scale 0.5 does).
    const result = await searchTargetSize({
      scales: [1, 0.5, 0.25],
      renderAtScale,
      encode,
      budgetBytes: 80, // scale 1 floor = 0.1*1*1000 = 100 > 80; scale 0.5 floor = 50 <= 80
      minQuality: 0.1,
      maxQuality: 1,
      qualitySteps: 10,
      deadlineMs: Date.now() + 10000,
    });

    expect(renderAtScale).toHaveBeenCalledTimes(2);
    expect(result.scale).toBe(0.5);
    expect(result.encoded.size).toBeLessThanOrEqual(80);
  });

  it('keeps the smallest result seen as an honest fallback when nothing fits', async () => {
    const { encode } = makeEncoder();
    const renderAtScale = vi.fn((scale) => ({ scale }));

    const result = await searchTargetSize({
      scales: [1, 0.5, 0.25],
      renderAtScale,
      encode,
      budgetBytes: 1, // impossible even at the lowest scale and minimum quality
      minQuality: 0.1,
      maxQuality: 1,
      qualitySteps: 5,
      deadlineMs: Date.now() + 10000,
    });

    // Every scale was tried since none of them ever fit the budget.
    expect(renderAtScale).toHaveBeenCalledTimes(3);
    // The smallest floor is at the smallest scale (0.25 * 0.1 * 1000 = 25).
    expect(result.scale).toBe(0.25);
    expect(result.quality).toBe(0.1);
    expect(result.encoded.size).toBe(25);
    expect(result.encoded.size).toBeGreaterThan(1); // did not meet the budget
  });

  it('respects the deadline and stops trying further scales or quality steps', async () => {
    let now = 1000;
    const realNow = Date.now;
    Date.now = () => now;

    try {
      const renderAtScale = vi.fn((scale) => {
        now += 10; // rendering takes some time
        return { scale };
      });
      const encode = vi.fn((handle, quality) => {
        now += 10; // encoding takes some time too
        return Promise.resolve({ size: sizeFor(handle.scale, quality) });
      });

      const result = await searchTargetSize({
        scales: [1, 0.5, 0.25],
        renderAtScale,
        encode,
        budgetBytes: 1, // never fits, so the search would otherwise try every scale
        minQuality: 0.1,
        maxQuality: 1,
        qualitySteps: 20,
        deadlineMs: 1015, // passes right after the first scale's floor probe (ends at 1020)
      });

      // The deadline is only checked once a best-effort result exists, so
      // the first scale still completes its floor probe before the second
      // scale's "time's up" check kicks in and stops the ladder walk.
      expect(renderAtScale).toHaveBeenCalledTimes(1);
      expect(result.scale).toBe(1);
    } finally {
      Date.now = realNow;
    }
  });

  it('keeps the best result when the budget is met exactly at the floor quality', async () => {
    const { encode } = makeEncoder();
    const renderAtScale = vi.fn((scale) => ({ scale }));

    const result = await searchTargetSize({
      scales: [1],
      renderAtScale,
      encode,
      budgetBytes: 50, // exactly the floor size (1 * 0.05 * 1000 = 50)
      minQuality: 0.05,
      maxQuality: 1,
      qualitySteps: 8,
      deadlineMs: Date.now() + 10000,
    });

    expect(result.encoded.size).toBeLessThanOrEqual(50);
  });
});
