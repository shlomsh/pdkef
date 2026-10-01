/**
 * RED-15: the box of a set of glyphs. Find maps a match to the glyphs that
 * drew it (`itemGlyphs.ts`); this turns them into one PDF-point box.
 *
 * A `cover` box is the glyphs' ink band, padded by 1 pt, then drawn back
 * wherever it would reach into a neighbour's glyph core (the band RED-12's
 * layer uses to decide what a box hides). Printed forms set lines about 1.04
 * ems apart, so a band tall enough for every accent and descender reaches the
 * line above and below; a fixed height cannot both cover the ink and leave
 * those lines whole, and a neighbour that is painted over also drops out of
 * the saved file's text layer. The box never shrinks below the matched
 * glyphs' own cores. Pure; no DOM, no pdf.js import.
 */

import type { PageGlyph } from '../../../editor/adapters/pdf/pageGlyphs.ts';
import type { PageGlyphMap } from './itemGlyphs.ts';

export interface PointBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** `cover` is the box a redaction gets. `core` is the glyphs' cores with no
 * pad, for asking whether an existing box already hides a match: a tightly
 * drawn box hides the letters without containing their ink. */
export type GlyphBoxShape = 'cover' | 'core';

const PAD_PT = 1;
/** The ink band of a glyph, in ems from the baseline: the descenders and the
 * tallest ascenders and accents of Latin and Hebrew. */
const INK_BOTTOM_EM = -0.25;
const INK_TOP_EM = 0.9;
/** The core band and side inset `textLayer.ts` uses. */
const CORE_BOTTOM_EM = -0.15;
const CORE_TOP_EM = 0.7;
const SIDE_INSET_EM = 0.15;
const SIDE_INSET_SHARE = 0.3;
/** A cut edge stops this far short of the neighbour's core, in points, since
 * touching counts as reaching it. */
const CLEARANCE_PT = 0.05;

/** A rectangle in a text line's own frame: `s` along the baseline, `t` up. */
interface Rect {
  s0: number;
  s1: number;
  t0: number;
  t1: number;
}

/** The unit vector along a line's baseline; `t` runs 90 degrees from it. */
interface Frame {
  ux: number;
  uy: number;
}

function frameOf(glyph: PageGlyph): Frame {
  const length = Math.hypot(glyph.matrix[0], glyph.matrix[1]);
  return length === 0 ? { ux: 1, uy: 0 } : { ux: glyph.matrix[0] / length, uy: glyph.matrix[1] / length };
}

/** A glyph's em band `[x0, x1] x [y0, y1]` as a rectangle in `frame`. */
function band(frame: Frame, glyph: PageGlyph, x0: number, x1: number, y0: number, y1: number): Rect {
  const [a, b, c, d, e, f] = glyph.matrix;
  const s: number[] = [];
  const t: number[] = [];
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
    const px = a * x + c * y + e;
    const py = b * x + d * y + f;
    s.push(px * frame.ux + py * frame.uy);
    t.push(-px * frame.uy + py * frame.ux);
  }
  return { s0: Math.min(...s), s1: Math.max(...s), t0: Math.min(...t), t1: Math.max(...t) };
}

const inkOf = (frame: Frame, glyph: PageGlyph) => band(frame, glyph, 0, Math.max(glyph.width, 0), INK_BOTTOM_EM, INK_TOP_EM);

function coreOf(frame: Frame, glyph: PageGlyph): Rect {
  const w = Math.max(glyph.width, 0);
  const inset = Math.min(SIDE_INSET_EM, SIDE_INSET_SHARE * w);
  return band(frame, glyph, inset, w - inset, CORE_BOTTOM_EM, CORE_TOP_EM);
}

function union(rects: Rect[]): Rect {
  return {
    s0: Math.min(...rects.map((r) => r.s0)),
    s1: Math.max(...rects.map((r) => r.s1)),
    t0: Math.min(...rects.map((r) => r.t0)),
    t1: Math.max(...rects.map((r) => r.t1)),
  };
}

/** A frame rectangle as the axis-aligned PDF-point box around it. */
function toPointBox(frame: Frame, rect: Rect): PointBox {
  const points = [[rect.s0, rect.t0], [rect.s1, rect.t0], [rect.s0, rect.t1], [rect.s1, rect.t1]].map(([s, t]) => ({
    x: s * frame.ux - t * frame.uy,
    y: s * frame.uy + t * frame.ux,
  }));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const touches = (a: Rect, b: Rect) => a.s0 <= b.s1 && a.s1 >= b.s0 && a.t0 <= b.t1 && a.t1 >= b.t0;

const isBlank = (glyph: PageGlyph) => glyph.isSpace || glyph.unicode.trim() === '';

/** Draws `box` back from `other`'s core with the cheapest single cut that
 * keeps `keep`, or leaves it when `other` sits on `keep` itself. */
function cutAway(box: Rect, keep: Rect, other: Rect): Rect {
  const cuts: { lost: number; apply: () => Rect }[] = [];
  if (other.s0 > keep.s1) {
    const s1 = Math.max(keep.s1, other.s0 - CLEARANCE_PT);
    cuts.push({ lost: box.s1 - s1, apply: () => ({ ...box, s1 }) });
  }
  if (other.s1 < keep.s0) {
    const s0 = Math.min(keep.s0, other.s1 + CLEARANCE_PT);
    cuts.push({ lost: s0 - box.s0, apply: () => ({ ...box, s0 }) });
  }
  if (other.t0 > keep.t1) {
    const t1 = Math.max(keep.t1, other.t0 - CLEARANCE_PT);
    cuts.push({ lost: box.t1 - t1, apply: () => ({ ...box, t1 }) });
  }
  if (other.t1 < keep.t0) {
    const t0 = Math.min(keep.t0, other.t1 + CLEARANCE_PT);
    cuts.push({ lost: t0 - box.t0, apply: () => ({ ...box, t0 }) });
  }
  if (cuts.length === 0) return box;
  return cuts.reduce((best, cut) => (cut.lost < best.lost ? cut : best)).apply();
}

/**
 * The PDF-point box of `matched`, glyphs of one line. `near` lists glyphs
 * around a rectangle (the page's index); a `cover` box keeps clear of the
 * cores of those that are not `matched`. Null for no glyphs.
 */
export function glyphsBox(matched: readonly PageGlyph[], near: PageGlyphMap['near'], shape: GlyphBoxShape = 'cover'): PointBox | null {
  if (matched.length === 0) return null;
  const frame = frameOf(matched[0]);
  const core = union(matched.map((glyph) => coreOf(frame, glyph)));
  if (shape === 'core') return toPointBox(frame, core);

  const ink = union(matched.map((glyph) => inkOf(frame, glyph)));
  let box: Rect = { s0: ink.s0 - PAD_PT, s1: ink.s1 + PAD_PT, t0: ink.t0 - PAD_PT, t1: ink.t1 + PAD_PT };
  const around = toPointBox(frame, box);
  const size = Math.hypot(matched[0].matrix[0], matched[0].matrix[1]);
  const chosen = new Set(matched);
  for (const other of near(around.x0, around.y0, around.x1, around.y1, 2 * size)) {
    if (chosen.has(other) || isBlank(other)) continue;
    const otherCore = coreOf(frame, other);
    if (touches(box, otherCore)) box = cutAway(box, core, otherCore);
  }
  return toPointBox(frame, box);
}
