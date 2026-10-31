import { describe, expect, it } from 'vitest';
import { bandsForSwipe } from './bands.ts';
import type { TextRow } from './textRows.ts';

// Rows 20px tall, pad 3. Words at x 20-60, 90-130, 160-200.
const row = (top: number): TextRow => ({ top, bottom: top + 20, left: 20, right: 200, gaps: [[60, 90], [130, 160]] });
const rows = [row(20), row(60), row(100)];

describe('bandsForSwipe', () => {
  it('snaps both ends of a one-row swipe to word edges', () => {
    const [b] = bandsForSwipe(rows, { x: 92, y: 30 }, { x: 128, y: 30 }, 20);
    expect(b.left).toBe(90);
    expect(b.left + b.width).toBe(130);
    expect(b.top).toBe(17);
    expect(b.height).toBe(26);
  });

  it('keeps one band of the row height when the finger drifts inside the row', () => {
    const bands = bandsForSwipe(rows, { x: 92, y: 24 }, { x: 128, y: 36 }, 20);
    expect(bands).toHaveLength(1);
    expect(bands[0].height).toBe(26);
  });

  it('gives first partial, middle full, last partial for a downward swipe', () => {
    const bands = bandsForSwipe(rows, { x: 92, y: 30 }, { x: 128, y: 110 }, 20);
    expect(bands).toHaveLength(3);
    expect(bands[0].left).toBe(90);
    expect(bands[0].left + bands[0].width).toBe(200);
    expect(bands[1].left).toBe(20);
    expect(bands[1].width).toBe(180);
    expect(bands[2].left).toBe(20);
    expect(bands[2].left + bands[2].width).toBe(130);
  });

  it('gives the same bands for an upward swipe', () => {
    const down = bandsForSwipe(rows, { x: 92, y: 30 }, { x: 128, y: 110 }, 20);
    const up = bandsForSwipe(rows, { x: 128, y: 110 }, { x: 92, y: 30 }, 20);
    expect(up).toEqual(down);
  });

  it('gives one fallback band when the swipe starts off text', () => {
    const bands = bandsForSwipe(rows, { x: 40, y: 300 }, { x: 140, y: 305 }, 18);
    expect(bands).toEqual([{ left: 40, top: 291, width: 100, height: 18 }]);
  });

  it('treats a reverse swipe on one row like the forward one', () => {
    const fwd = bandsForSwipe(rows, { x: 92, y: 30 }, { x: 128, y: 30 }, 20);
    const rev = bandsForSwipe(rows, { x: 128, y: 30 }, { x: 92, y: 30 }, 20);
    expect(rev).toEqual(fwd);
  });

  describe('right to left', () => {
    it('runs the first row from its left edge to the press and the last from the release to its right edge', () => {
      const bands = bandsForSwipe(rows, { x: 128, y: 30 }, { x: 92, y: 110 }, 20, 'rtl');
      expect(bands).toHaveLength(3);
      expect(bands[0].left).toBe(20);
      expect(bands[0].left + bands[0].width).toBe(130);
      expect(bands[1].left).toBe(20);
      expect(bands[1].width).toBe(180);
      expect(bands[2].left).toBe(90);
      expect(bands[2].left + bands[2].width).toBe(200);
    });

    it('gives the same bands for an upward swipe', () => {
      const down = bandsForSwipe(rows, { x: 128, y: 30 }, { x: 92, y: 110 }, 20, 'rtl');
      const up = bandsForSwipe(rows, { x: 92, y: 110 }, { x: 128, y: 30 }, 20, 'rtl');
      expect(up).toEqual(down);
    });

    it('leaves a one-row swipe as in ltr', () => {
      expect(bandsForSwipe(rows, { x: 128, y: 30 }, { x: 92, y: 30 }, 20, 'rtl'))
        .toEqual(bandsForSwipe(rows, { x: 128, y: 30 }, { x: 92, y: 30 }, 20));
    });
  });
});
