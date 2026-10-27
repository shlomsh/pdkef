/**
 * MERGE-07 / MERGE-10: where a file dragged in from outside the page would
 * land. Pure geometry over plain rects (numbers in, a position out), so the
 * hit-testing is testable without a DOM; the island's useFileDropTargets
 * reads the rects and paints the insertion line.
 */

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** True when the point is inside the rect grown by `slack` on every side. */
export function pointWithin(rect: Rect, x: number, y: number, slack: number): boolean {
  return x >= rect.left - slack && x <= rect.right + slack && y >= rect.top - slack && y <= rect.bottom + slack;
}

/** The rail list: the insertion index is the first row whose vertical middle
 * is below the pointer, or the row count when the pointer is past them all. */
export function rowInsertIndex(rows: Pick<Rect, 'top' | 'bottom'>[], y: number): number {
  for (let i = 0; i < rows.length; i += 1) {
    if (y < rows[i].top + (rows[i].bottom - rows[i].top) / 2) return i;
  }
  return rows.length;
}

/** The page grid: the first card whose horizontal middle is after the
 * pointer in reading direction (before it, in a right-to-left grid). */
export function cardInsertIndex(cards: Pick<Rect, 'left' | 'right'>[], x: number, rtl: boolean): number {
  for (let i = 0; i < cards.length; i += 1) {
    const middle = cards[i].left + (cards[i].right - cards[i].left) / 2;
    if (rtl ? x > middle : x < middle) return i;
  }
  return cards.length;
}
