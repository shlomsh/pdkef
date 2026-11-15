import { describe, expect, it, vi } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { solid } from './edges/testImages.ts';
import { onThePaper } from './sheetCorners.ts';

// Edge following that comes back with three corners on one spot and one far away: not a page.
const SLIVER: Quad = [{ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }, { x: 0.9, y: 0.9 }];
vi.mock('./edges/follow.ts', () => ({ followEdges: () => ({ quad: SLIVER, sides: [] }) }));

describe('onThePaper when edge following does not give a page', () => {
  it('keeps the plan unchanged', () => {
    const planned: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    expect(onThePaper(planned, solid(100, 100, 128))).toBe(planned);
  });
});
