import { describe, expect, it } from 'vitest';
import { corpus } from './corpus.ts';
import { guessByOutline } from './outline.ts';
import { guessByScoredRegions } from './scoredRegions.ts';
import { addNoise, solid } from './testImages.ts';

const err = (got: { x: number; y: number }[], truth: { x: number; y: number }[]) =>
  Math.max(...got.map((p, i) => Math.max(Math.abs(p.x - truth[i].x), Math.abs(p.y - truth[i].y))));

describe('outline strategy', () => {
  it('finds every corpus page by its straight edges', () => {
    for (const c of corpus) {
      const got = guessByOutline(c.image);
      expect(got, c.name).not.toBeNull();
      expect(err(got!, c.truth), c.name).toBeLessThanOrEqual(c.tol ?? 0.035);
    }
  });

  it('keeps a dark printed band inside the page, where brightness alone cuts it off', () => {
    const c = corpus.find((x) => x.name === 'dark band on left quarter')!;
    expect(err(guessByScoredRegions(c.image) ?? [{ x: 9, y: 9 }], c.truth)).toBeGreaterThan(0.08);
    expect(err(guessByOutline(c.image)!, c.truth)).toBeLessThan(0.02);
  });

  it('says null for a frame with no page in it', () => {
    const img = solid(320, 427, 90);
    addNoise(img, 8, 5);
    expect(guessByOutline(img)).toBeNull();
  });

  // A measurement, not a gate: unit runs share the machine, so a wall-clock assertion here fails
  // whenever the suite runs in parallel (128ms seen under check:fast). Budgets live in Playwright's
  // PERF_BUDGETS (CLAUDE.md); this keeps the number in view.
  it('logs its time on a phone-sized preview (target: under 40ms on its own)', () => {
    const c = corpus[2];
    guessByOutline(c.image); // warm the JIT
    const t0 = performance.now();
    const quad = guessByOutline(c.image);
    console.log(`outline guess: ${(performance.now() - t0).toFixed(1)}ms`);
    expect(quad).not.toBeNull();
  });
});
