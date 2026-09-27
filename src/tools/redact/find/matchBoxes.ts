/**
 * RED-02: turns a proposed text range into the page-percent boxes a redaction
 * element stores, one per line the range covers. Pure; no DOM, no pdf.js
 * import.
 */

import { toPagePercentBox, type PageGeometry } from '../../../editor/geometry/coords.ts';
import type { PageText, PercentBox, PlacedItem, TextRange } from './types.ts';

const PAD_PT = 1;
const DESCENT_FACTOR = 0.25;
const ASCENT_FACTOR = 1.0;

interface PointBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function normalize(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

/** The axis-aligned PDF-point box a character slice of one item covers. */
function sliceBox(item: PlacedItem, fromChar: number, toChar: number): PointBox {
  const len = item.end - item.start;
  const fa = len > 0 ? fromChar / len : 0;
  const fb = len > 0 ? toChar / len : 0;
  const [a, b, c, d, e, f] = item.transform;

  const f0 = item.rtl ? 1 - fb : fa;
  const f1 = item.rtl ? 1 - fa : fb;

  const u = normalize(a, b);
  let n = normalize(c, d);
  if (n.x === 0 && n.y === 0) {
    // u rotated +90 degrees.
    n = { x: -u.y, y: u.x };
  }

  const p0 = { x: e + u.x * item.width * f0, y: f + u.y * item.width * f0 };
  const p1 = { x: e + u.x * item.width * f1, y: f + u.y * item.width * f1 };

  const descent = DESCENT_FACTOR * item.height;
  const ascent = ASCENT_FACTOR * item.height;

  const corners = [
    { x: p0.x - n.x * descent, y: p0.y - n.y * descent },
    { x: p0.x + n.x * ascent, y: p0.y + n.y * ascent },
    { x: p1.x - n.x * descent, y: p1.y - n.y * descent },
    { x: p1.x + n.x * ascent, y: p1.y + n.y * ascent },
  ];

  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function padBox(box: PointBox): PointBox {
  return { x0: box.x0 - PAD_PT, y0: box.y0 - PAD_PT, x1: box.x1 + PAD_PT, y1: box.y1 + PAD_PT };
}

function unionBox(a: PointBox, b: PointBox): PointBox {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

function clampPercentBox(box: PercentBox): PercentBox {
  const left = Math.min(100, Math.max(0, box.left));
  const top = Math.min(100, Math.max(0, box.top));
  const right = Math.min(100, Math.max(0, box.left + box.width));
  const bottom = Math.min(100, Math.max(0, box.top + box.height));
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** True when nothing between two spans in the page's text is a line break. */
function isSameLine(page: PageText, prevEnd: number, nextStart: number): boolean {
  return !page.text.slice(prevEnd, nextStart).includes('\n');
}

/**
 * Boxes for one proposed match: one per line `range` covers, in the range's
 * reading order. See `types.ts` for the full contract.
 */
export function matchBoxes(page: PageText, range: TextRange, geometry: PageGeometry): PercentBox[] {
  const overlapping = page.items.filter((item) => item.end > range.start && item.start < range.end);
  if (overlapping.length === 0) return [];

  const paddedBoxes = overlapping.map((item) => {
    const from = Math.max(0, range.start - item.start);
    const to = Math.min(item.end - item.start, range.end - item.start);
    return padBox(sliceBox(item, from, to));
  });

  const mergedBoxes: PointBox[] = [paddedBoxes[0]];
  for (let i = 1; i < paddedBoxes.length; i += 1) {
    const prevItem = overlapping[i - 1];
    const curItem = overlapping[i];
    if (isSameLine(page, prevItem.end, curItem.start)) {
      mergedBoxes[mergedBoxes.length - 1] = unionBox(mergedBoxes[mergedBoxes.length - 1], paddedBoxes[i]);
    } else {
      mergedBoxes.push(paddedBoxes[i]);
    }
  }

  return mergedBoxes.map((box) =>
    clampPercentBox(toPagePercentBox(geometry, { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 })),
  );
}
