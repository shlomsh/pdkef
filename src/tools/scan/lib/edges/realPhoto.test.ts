import { describe, expect, it } from 'vitest';
import { ENVELOPE_ON_LAP_GRAY_B64 } from './fixtures/envelopeOnLap.ts';
import { guessCorners } from './index.ts';
import { guessByScoredRegions } from './scoredRegions.ts';
import type { GrayImage, Quad } from '../quad.ts';

// A real iPhone photo (2026-10-26) of a printed flyer on a lap: its green and blue print has no
// brightness boundary with the sheet, so brightness alone ran out to the frame. The fixture is the
// 180x320 gray copy the app hands the guesser; corners read off the full photo (1125x2000).
const W = 180;
const H = 320;
const truth: Quad = [{ x: 325 / 1125, y: 590 / 2000 }, { x: 975 / 1125, y: 645 / 2000 }, { x: 910 / 1125, y: 1690 / 2000 }, { x: 108 / 1125, y: 1558 / 2000 }];
const image: GrayImage = {
  width: W,
  height: H,
  data: Uint8ClampedArray.from(atob(ENVELOPE_ON_LAP_GRAY_B64), (c) => c.charCodeAt(0)),
};
const err = (q: Quad) => Math.max(...q.map((p, i) => Math.max(Math.abs(p.x - truth[i].x), Math.abs(p.y - truth[i].y))));

describe('real photo: flyer on a lap', () => {
  it('finds the sheet by its outline', () => {
    const got = guessCorners(image);
    expect(got).not.toBeNull();
    expect(err(got!)).toBeLessThan(0.03);
  });

  it('is a case brightness alone gets wrong', () => {
    const bright = guessByScoredRegions(image);
    expect(bright === null || err(bright) > 0.08).toBe(true);
  });
});
