import { describe, expect, it } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { solid } from './edges/testImages.ts';
import { onThePaper } from './sheetCorners.ts';

describe('onThePaper when edge following does not give a page', () => {
  it('keeps the plan unchanged', () => {
    // Three corners on one spot and one far away: the real edge following cannot slide that onto a page
    // (on a blank sheet it comes back with the same sliver), so the plan is what stays.
    const planned: Quad = [{ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }, { x: 0.9, y: 0.9 }];
    expect(onThePaper(planned, solid(100, 100, 128))).toBe(planned);
  });
});
