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

  it('stays under 40ms on a phone-sized preview', () => {
    const c = corpus[2];
    guessByOutline(c.image); // warm the JIT
    const t0 = performance.now();
    guessByOutline(c.image);
    expect(performance.now() - t0).toBeLessThan(40);
  });
});
