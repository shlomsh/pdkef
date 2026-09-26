import { describe, expect, it } from 'vitest';
import { reachTarget } from './fillReach.ts';
import type { ReachTarget } from './fillTypes.ts';

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

const target = (key: string, pageIndex: number, b: ReturnType<typeof box>): ReachTarget => (
  { kind: 'fill', key, pageIndex, box: b }
);

// pxPerPercent 1:1 throughout except the zoom test, so a box's percent numbers double
// as the screen-pixel distances the reach budget is measured in.
const unit = { x: 1, y: 1 };

describe('reachTarget', () => {
  it('matches a point inside the box, with zero score', () => {
    const field = target('a', 0, box(10, 10, 20, 10));
    expect(reachTarget({ pageIndex: 0, x: 15, y: 12 }, [field], unit)).toBe(field);
  });

  it('reaches a point just outside the box, within the flat reachPx budget', () => {
    const field = target('a', 0, box(10, 10, 20, 10)); // right edge at 30
    const found = reachTarget({ pageIndex: 0, x: 45, y: 15 }, [field], unit); // 15px right, vertically centred
    expect(found).toBe(field);
  });

  it('misses a point past the flat reachPx budget', () => {
    const field = target('a', 0, box(10, 10, 20, 10));
    expect(reachTarget({ pageIndex: 0, x: 55, y: 15 }, [field], unit)).toBeNull(); // 25px right
  });

  it('reaches further up than down, into the printed label above a tall field', () => {
    // height 40: reach up = max(22, 1.5x40) = 60, reach down = max(22, 0.75x40) = 30.
    const field = target('a', 0, box(0, 100, 50, 40)); // top 100, bottom 140
    const above = reachTarget({ pageIndex: 0, x: 25, y: 100 - 45 }, [field], unit); // 45px above the top
    const below = reachTarget({ pageIndex: 0, x: 25, y: 140 + 45 }, [field], unit); // 45px below the bottom
    expect(above).toBe(field);
    expect(below).toBeNull();
  });

  it('reaches a slip just below the writing line, past the flat budget but inside belowReach', () => {
    const field = target('a', 0, box(0, 100, 50, 40)); // reach down = max(22, 0.75x40) = 30
    expect(reachTarget({ pageIndex: 0, x: 25, y: 140 + 25 }, [field], unit)).toBe(field);
  });

  it('between two rows, the field whose label was tapped wins at equal raw distance', () => {
    const rowAbove = target('above', 0, box(0, 0, 100, 10)); // bottom at 10
    const rowBelow = target('below', 0, box(0, 30, 100, 10)); // top at 30
    // reachPx 10, labelReach x2 (reach up 20), belowReach x1 (reach down 10) on a 10px row.
    const options = { reachPx: 10, labelReach: 2, belowReach: 1 };
    // Tap in the gap, 10px from each row's near edge - equally close either way.
    const found = reachTarget({ pageIndex: 0, x: 50, y: 20 }, [rowAbove, rowBelow], unit, options);
    expect(found).toBe(rowBelow);
  });

  it('ignores a target on a different page, even sitting exactly on the point', () => {
    const otherPage = target('a', 1, box(0, 0, 10, 10));
    expect(reachTarget({ pageIndex: 0, x: 5, y: 5 }, [otherPage], unit)).toBeNull();
  });

  it('the same percent gap is reachable at one zoom and not at a higher one', () => {
    const field = target('a', 0, box(0, 0, 10, 2)); // point sits 4 percent above the top
    const point = { pageIndex: 0, x: 5, y: -4 };
    // heightPx 10, reach up = max(22, 1.5x10=15) = 22 (the flat floor): 20px offset fits.
    expect(reachTarget(point, [field], { x: 5, y: 5 })).toBe(field);
    // heightPx 12, reach up = max(22, 1.5x12=18) = 22 (still the floor): 24px offset doesn't.
    expect(reachTarget(point, [field], { x: 6, y: 6 })).toBeNull();
  });

  it('breaks a tie in favour of the earlier target', () => {
    const first = target('first', 0, box(0, 0, 10, 10)); // right edge at 10
    const second = target('second', 0, box(20, 0, 10, 10)); // left edge at 20
    const found = reachTarget({ pageIndex: 0, x: 15, y: 5 }, [first, second], unit); // 5px from each
    expect(found).toBe(first);
  });

  it('returns null with nothing in reach', () => {
    const field = target('a', 0, box(0, 0, 10, 10));
    expect(reachTarget({ pageIndex: 0, x: 500, y: 500 }, [field], unit)).toBeNull();
  });
});
