import { describe, expect, it } from 'vitest';
import { fitGridColumns } from './fitGrid.ts';

// The desktop stage at 1440x900 is about 1030 by 800 once its status line is placed.
const stage = { width: 1030, height: 800, gap: 12, caption: 28, min: 140, max: 280 };

describe('fitGridColumns', () => {
  it('draws a short set as large as a tile may be', () => {
    expect(fitGridColumns({ ...stage, count: 3 })).toBe(4);
    expect(fitGridColumns({ ...stage, count: 8 })).toBe(4);
  });

  it('takes the largest tiles that still fit the whole set on the stage', () => {
    // Four across would need three rows of 248px tiles, past the stage's foot.
    expect(fitGridColumns({ ...stage, count: 12 })).toBe(5);
  });

  it('falls back to the smallest tiles when no size fits, and the grid scrolls', () => {
    expect(fitGridColumns({ ...stage, count: 60 })).toBe(6);
  });

  it('never returns fewer than one column', () => {
    expect(fitGridColumns({ ...stage, width: 100, count: 4 })).toBe(1);
    expect(fitGridColumns({ ...stage, width: 0, height: 0, count: 0 })).toBe(1);
  });
});
