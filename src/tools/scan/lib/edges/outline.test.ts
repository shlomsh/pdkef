import { describe, expect, it } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { corpus } from './corpus.ts';
import { buildEdgeMap } from '#lib/pageEnhance/edgeMap.ts';
import { cutAtFold } from './fold.ts';
import { fitToPaper } from './grow.ts';
import { guessByOutline, scoreQuad } from './outline.ts';
import { guessByScoredRegions } from './scoredRegions.ts';
import { addNoise, solid, twoPages } from './testImages.ts';

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
    let best = Infinity; // fastest of a few runs: the first warms the JIT, and a busy test worker adds noise
    let quad = null;
    for (let run = 0; run < 5; run += 1) {
      const t0 = performance.now();
      quad = guessByOutline(c.image);
      best = Math.min(best, performance.now() - t0);
    }
    console.log(`outline guess: ${best.toFixed(1)}ms (fastest of 5)`);
    expect(quad).not.toBeNull();
  });
});

describe('scoreQuad with a fold side', () => {
  it('scores a fold side by its edges alone, since both pages there are equally bright', () => {
    const W = 320;
    const H = 427;
    const img = twoPages();
    const raw: Quad = [{ x: 30, y: 40 }, { x: W - 1, y: 40 }, { x: W - 1, y: 390 }, { x: 30, y: 390 }].map((p) => ({ x: p.x / W, y: p.y / H })) as Quad;
    const cut = cutAtFold(img, fitToPaper(img, raw));
    expect(cut.folds).toEqual([1]);
    const map = buildEdgeMap(img);
    expect(scoreQuad(map, cut.quad, cut.folds)).toBeGreaterThan(0);
    expect(scoreQuad(map, cut.quad)).toBe(0);
  });
});
