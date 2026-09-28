/**
 * RED-02: turns a proposed text range into the page-percent boxes a redaction
 * element stores, one per line the range covers. Pure; no DOM, no pdf.js
 * import.
 */

import { toPagePercentBox, type PageGeometry } from '../../../editor/geometry/coords.ts';
import type { PageText, PercentBox, PlacedItem, TextRange } from './types.ts';

const PAD_PT = 1;
/** Extra cover, in ems, at an edge that cuts through a text item. pdf.js
 * gives one advance for the whole item, not per glyph, so a cut edge is an
 * estimate; erring into the neighbouring letter is safe, leaving a sliver of
 * the matched one is not. */
const CUT_PAD_EM = 0.35;

/** Relative advance of a string. The default counts characters; the island
 * passes a real font measurement, which apportions a proportional font far
 * better. Only ratios of it are used. */
export type MeasureText = (text: string) => number;
const countChars: MeasureText = (text) => text.length;
const DESCENT_FACTOR = 0.25;
const ASCENT_FACTOR = 1.0;

/** `cover` is the generous box a redaction gets. `core` is the letters'
 * own extent with no padding (the glyph-core band RED-12 uses, -0.15 to 0.7
 * em), for asking whether an existing box already hides a match: a tightly
 * drawn box hides the letters without containing their padding. */
export type MatchBoxShape = 'cover' | 'core';
const SHAPES: Record<MatchBoxShape, { pad: number; cutEm: number; descent: number; ascent: number }> = {
  cover: { pad: PAD_PT, cutEm: CUT_PAD_EM, descent: DESCENT_FACTOR, ascent: ASCENT_FACTOR },
  core: { pad: 0, cutEm: 0, descent: 0.15, ascent: 0.7 },
};

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
function sliceBox(item: PlacedItem, str: string, fromChar: number, toChar: number, measure: MeasureText, shape: MatchBoxShape): PointBox {
  const { cutEm, descent: descentEm, ascent: ascentEm } = SHAPES[shape];
  const len = str.length;
  const whole = measure(str);
  const at = (i: number) => (i <= 0 ? 0 : i >= len || whole <= 0 ? 1 : measure(str.slice(0, i)) / whole);
  // Cut edges widen by CUT_PAD_EM, as a fraction of the item's advance.
  const cut = item.width > 0 ? (cutEm * item.height) / item.width : 0;
  const fa = fromChar > 0 ? Math.max(0, at(fromChar) - cut) : 0;
  const fb = toChar < len ? Math.min(1, at(toChar) + cut) : 1;
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

  const descent = descentEm * item.height;
  const ascent = ascentEm * item.height;

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

function padBox(box: PointBox, pad: number): PointBox {
  return { x0: box.x0 - pad, y0: box.y0 - pad, x1: box.x1 + pad, y1: box.y1 + pad };
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
export function matchBoxes(
  page: PageText,
  range: TextRange,
  geometry: PageGeometry,
  measure: MeasureText = countChars,
  shape: MatchBoxShape = 'cover',
): PercentBox[] {
  const overlapping = page.items.filter((item) => item.end > range.start && item.start < range.end);
  if (overlapping.length === 0) return [];

  const paddedBoxes = overlapping.map((item) => {
    const from = Math.max(0, range.start - item.start);
    const to = Math.min(item.end - item.start, range.end - item.start);
    return padBox(sliceBox(item, page.text.slice(item.start, item.end), from, to, measure, shape), SHAPES[shape].pad);
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
