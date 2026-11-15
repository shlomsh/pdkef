import { describe, expect, it } from 'vitest';
import { buildEdgeMap } from '#lib/pageEnhance/edgeMap.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { cutAtFold } from './fold.ts';
import { cornerError } from './kpi.ts';
import { scoreQuad } from './outline.ts';
import { snapSides } from './snap.ts';
import { tiltedSpread } from './testImages.ts';

describe('snapSides', () => {
  it('follows the tilted edges of a page after its side was cut at the fold', () => {
    const { image, truth } = tiltedSpread();
    const axisAligned: Quad = [{ x: 0, y: 0.15 }, { x: 0.93, y: 0.15 }, { x: 0.93, y: 0.9 }, { x: 0, y: 0.9 }];
    const cut = cutAtFold(image, axisAligned);
    expect(cut.folds.length).toBeGreaterThan(0);
    const map = buildEdgeMap(image);
    const snapped = snapSides(map, cut.quad, cut.folds);
    expect(cornerError(snapped, truth)).toBeLessThan(0.02);
    expect(scoreQuad(map, cut.quad, cut.folds)).toBe(0);
    expect(scoreQuad(map, snapped, cut.folds)).toBeGreaterThan(0);
  });

  it('leaves a quad that already lies on the edges unchanged', () => {
    const { image, truth } = tiltedSpread();
    const map = buildEdgeMap(image);
    const snapped = snapSides(map, truth, [3]);
    expect(cornerError(snapped, truth)).toBeLessThan(0.004);
  });
});
