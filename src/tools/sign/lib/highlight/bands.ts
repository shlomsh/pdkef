// Turns a swipe over text rows into highlight bands: whole rows, ends snapped to word edges.
// Units are whatever the rows are in; the caller passes window pixels.
import type { TextRow } from './textRows.ts';

interface Point { x: number; y: number }
export interface Band { left: number; top: number; width: number; height: number }

const PAD_FRACTION = 0.15;
const REACH_FRACTION = 1.5;

const heightOf = (r: TextRow) => r.bottom - r.top;
const padOf = (r: TextRow) => PAD_FRACTION * heightOf(r);

/** Index of the row under y: inside its padded span, else the nearest within half its height. */
function rowIndexAt(rows: TextRow[], y: number): number {
  let best = -1;
  let bestDist = Infinity;
  rows.forEach((r, i) => {
    const pad = padOf(r);
    if (y >= r.top - pad && y <= r.bottom + pad) {
      best = i;
      bestDist = -1;
    } else if (bestDist >= 0) {
      const dist = Math.min(Math.abs(y - r.top), Math.abs(y - r.bottom));
      if (dist < heightOf(r) / 2 && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
  });
  return best;
}

/** The candidate nearest x within reach, else x. */
function snap(x: number, edges: number[], reach: number): number {
  let best = x;
  let bestDist = reach;
  for (const e of edges) {
    const d = Math.abs(e - x);
    if (d <= bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

/** A band over row r from x0 to x1 (snapped when asked), clamped to the row; null if empty. */
function bandOf(r: TextRow, x0: number, x1: number, snapStart: boolean, snapEnd: boolean): Band | null {
  const pad = padOf(r);
  const reach = REACH_FRACTION * heightOf(r);
  const starts = [r.left, ...r.gaps.map((g) => g[1])];
  const ends = [r.right, ...r.gaps.map((g) => g[0])];
  const clamp = (x: number) => Math.min(r.right + pad, Math.max(r.left - pad, x));
  const left = clamp(snapStart ? snap(x0, starts, reach) : x0);
  const right = clamp(snapEnd ? snap(x1, ends, reach) : x1);
  if (right - left <= 0) return null;
  return { left, top: r.top - pad, width: right - left, height: heightOf(r) + 2 * pad };
}

export function bandsForSwipe(rows: TextRow[], start: Point, end: Point, fallbackHeight: number): Band[] {
  let i0 = rowIndexAt(rows, start.y);
  if (i0 < 0) {
    const left = Math.min(start.x, end.x);
    return [{ left, top: start.y - fallbackHeight / 2, width: Math.max(start.x, end.x) - left, height: fallbackHeight }];
  }
  let i1 = rowIndexAt(rows, end.y);
  if (i1 < 0) {
    // Off the rows: the last row that begins above the finger, never short of the start row.
    let above = -1;
    rows.forEach((r, i) => { if (r.top <= end.y) above = i; });
    i1 = above < 0 ? i0 : end.y >= start.y ? Math.max(above, i0) : Math.min(above, i0);
  }
  let a = start;
  let b = end;
  if (i1 < i0 || (i1 === i0 && b.x < a.x)) {
    [a, b] = [b, a];
    [i0, i1] = [i1, i0];
  }
  const bands: Array<Band | null> = [];
  if (i0 === i1) {
    bands.push(bandOf(rows[i0], a.x, b.x, true, true));
  } else {
    bands.push(bandOf(rows[i0], a.x, rows[i0].right, true, false));
    for (let i = i0 + 1; i < i1; i += 1) bands.push(bandOf(rows[i], rows[i].left, rows[i].right, false, false));
    bands.push(bandOf(rows[i1], rows[i1].left, b.x, false, true));
  }
  return bands.filter((band): band is Band => band !== null);
}
