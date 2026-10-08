/**
 * RED-15: which glyph drew which character of a Find text item. A pdf.js text
 * item gives one advance for a whole run and a string in reading order; the
 * glyph read (`readPageGlyphs`) gives every glyph's exact place, in the page's
 * own order, which for Hebrew and Arabic is visual order. An item is mapped by
 * position: the glyphs whose centres sit on its baseline span, sorted along
 * it, then put in the order `str` reads in. The mapping is used only when the
 * glyphs spell the item's text exactly (spaces and bidi marks aside); anything
 * else maps to null, and the caller keeps the measured estimate for that item
 * so Find never offers nothing. Pure; no DOM, no pdf.js import.
 */

import type { PageGlyph } from '../../../editor/adapters/pdf/pageGlyphs.ts';
import type { PageText, PlacedItem } from './types.ts';

/** Glyphs are kept for as long as Find or the check holds a page. Past this
 * many in all (about 60 MB) the later pages keep none and their boxes are
 * estimated from the text items, so a very long document cannot run a phone
 * out of memory. */
export const GLYPH_BUDGET = 400_000;

/** How far off the item's baseline a glyph's origin may sit and still belong
 * to it, as a share of the item's height (superscripts rise by a few tenths). */
const OFF_BASELINE = 0.5;
/** A glyph this close (in ems) to an identical one is the same glyph overprinted. */
const OVERPRINT = 0.15;

/** True when `copy` is `glyph` drawn again over itself: the same character,
 * origin within OVERPRINT em on each axis (em from `glyph`, else `fallbackEm`). */
export function isOverprint(glyph: PageGlyph, copy: PageGlyph, fallbackEm = 0): boolean {
  const em = Math.hypot(glyph.matrix[0], glyph.matrix[1]) || fallbackEm;
  return (
    copy.unicode === glyph.unicode &&
    Math.abs(copy.matrix[4] - glyph.matrix[4]) <= OVERPRINT * em &&
    Math.abs(copy.matrix[5] - glyph.matrix[5]) <= OVERPRINT * em
  );
}
/** Slack along the baseline, as a share of the item's height. */
const ALONG_SLACK = 0.01;

/** Whitespace and bidi marks: no glyph is worth boxing and pdf.js adds or
 * drops them freely, so they are left out of the comparison. */
const IGNORED = /[\s​-‏‪-‮⁠﻿]/;
/** The characters pdf.js folds to their compatibility form in `str`
 * (ligatures and presentation forms). */
const PDFJS_FOLDED = /[µ;ຳΩﬀ-﷿ﹰ-ﻼ]/;
/** pdf.js mirrors brackets in right-to-left runs, so they compare by pair. */
const BRACKET_CLASS: Record<string, string> = { '(': 'o', ')': 'o', '[': 'p', ']': 'p', '{': 'q', '}': 'q', '<': 'r', '>': 'r' };
/** A character of a left-to-right run inside right-to-left text, and the
 * neutrals that may sit between two of them ("12/03/2021"). */
const LTR_CHAR = /[A-Za-z0-9]/;
const LTR_JOINER = /[.,:/%+-]/;

interface Placed {
  ch: string;
  glyph: PageGlyph;
}

/** For each UTF-16 index of an item's `str`, the glyph that drew it; null for
 * whitespace, bidi marks and anything without a glyph. */
export type ItemGlyphs = (PageGlyph | null)[];

const glyphText = (glyph: PageGlyph) => (PDFJS_FOLDED.test(glyph.unicode) ? glyph.unicode.normalize('NFKC') : glyph.unicode);
const comparable = (ch: string) => BRACKET_CLASS[ch] ?? ch;

/** A run of glyphs in visual (left to right) order, read in logical order for
 * right-to-left text: the whole run reversed, then each left-to-right run
 * (digits, Latin, the dots and slashes inside a number) put back the way it
 * reads. */
function logicalOrder(visual: Placed[]): Placed[] {
  const out = [...visual].reverse();
  let i = 0;
  while (i < out.length) {
    if (!LTR_CHAR.test(out[i].ch)) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < out.length && (LTR_CHAR.test(out[j].ch) || (LTR_JOINER.test(out[j].ch) && j + 1 < out.length && LTR_CHAR.test(out[j + 1].ch)))) j += 1;
    const run = out.slice(i, j).reverse();
    run.forEach((placed, k) => { out[i + k] = placed; });
    i = j;
  }
  return out;
}

/** Hebrew and Arabic letters (and their presentation forms). */
const RTL_CHAR = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;

/** The same run read in logical order when the line itself runs left to
 * right: only each right-to-left stretch (its letters and the neutrals
 * between them) is reversed, in place. */
function logicalOrderInPlace(visual: Placed[]): Placed[] {
  const out = [...visual];
  let i = 0;
  while (i < out.length) {
    if (!RTL_CHAR.test(out[i].ch)) {
      i += 1;
      continue;
    }
    let end = i + 1;
    for (let j = i + 1; j < out.length && !LTR_CHAR.test(out[j].ch); j += 1) {
      if (RTL_CHAR.test(out[j].ch)) end = j + 1;
    }
    out.splice(i, end - i, ...out.slice(i, end).reverse());
    i = end;
  }
  return out;
}

/**
 * The glyphs `item` drew, one per character of `str`, or null when they do
 * not spell it. `candidates` are glyphs already near the item (the caller's
 * spatial index); the baseline test here is exact.
 */
export function mapItemGlyphs(item: PlacedItem, str: string, candidates: readonly PageGlyph[]): ItemGlyphs | null {
  const [a, b, , , e, f] = item.transform;
  const length = Math.hypot(a, b);
  if (length === 0 || item.height <= 0) return null;
  const ux = a / length;
  const uy = b / length;

  const onItem: { along: number; glyph: PageGlyph }[] = [];
  for (const glyph of candidates) {
    const dx = glyph.matrix[4] - e;
    const dy = glyph.matrix[5] - f;
    const along = dx * ux + dy * uy;
    const across = -dx * uy + dy * ux;
    if (Math.abs(across) > OFF_BASELINE * item.height) continue;
    const advance = (glyph.matrix[0] * ux + glyph.matrix[1] * uy) * Math.max(glyph.width, 0);
    const centre = along + advance / 2;
    const slack = ALONG_SLACK * item.height;
    if (centre < -slack || centre >= item.width - slack) continue;
    onItem.push({ along, glyph });
  }
  onItem.sort((p, q) => p.along - q.along);

  // A glyph drawn again over itself (faked bold) is one glyph. A copy joins
  // the first kept glyph whose cluster it repeats, so a triple draw in small
  // steps stays one glyph.
  const clusters = new Map<PageGlyph, PageGlyph[]>();
  for (const { glyph } of onItem) {
    const em = Math.hypot(glyph.matrix[0], glyph.matrix[1]) || item.height;
    let joined = false;
    for (const members of clusters.values()) {
      if (members.some((member) => isOverprint(glyph, member, em))) {
        members.push(glyph);
        joined = true;
        break;
      }
    }
    if (!joined) clusters.set(glyph, [glyph]);
  }
  const kept = [...clusters.keys()];

  const visual: Placed[] = [];
  for (const glyph of kept) {
    for (const ch of glyphText(glyph)) {
      if (!IGNORED.test(ch)) visual.push({ ch, glyph });
    }
  }

  const wanted: number[] = [];
  for (let i = 0; i < str.length; i += 1) {
    if (!IGNORED.test(str[i])) wanted.push(i);
  }
  if (wanted.length === 0 || wanted.length !== visual.length) return null;

  const matches = (order: Placed[]) => order.every((placed, k) => comparable(placed.ch) === comparable(str[wanted[k]]));
  const rtlFirst = [logicalOrder(visual), logicalOrderInPlace(visual), visual];
  const orders = item.rtl ? rtlFirst : [visual, logicalOrderInPlace(visual), logicalOrder(visual)];
  const order = orders.find(matches);
  if (!order) return null;

  const mapped: ItemGlyphs = new Array(str.length).fill(null);
  order.forEach((placed, k) => { mapped[wanted[k]] = placed.glyph; });
  return mapped;
}

/** The distinct glyphs that drew characters `[from, to)` of an item, in order. */
export function glyphsOf(mapped: ItemGlyphs, from: number, to: number): PageGlyph[] {
  const glyphs = new Set<PageGlyph>();
  for (let i = from; i < to; i += 1) {
    const glyph = mapped[i];
    if (glyph) glyphs.add(glyph);
  }
  return [...glyphs];
}

/** A page's items mapped to their glyphs, and a spatial index of the glyphs
 * for the box code to ask who sits near a box. */
export interface PageGlyphMap {
  /** Per `PageText.items` entry, its glyphs, or null where they do not spell it. */
  items: (ItemGlyphs | null)[];
  /** Glyphs whose origin lies within `reach` points of the rectangle. */
  near(x0: number, y0: number, x1: number, y1: number, reach: number): PageGlyph[];
}

const CELL_PT = 32;

function buildIndex(glyphs: readonly PageGlyph[]): PageGlyphMap['near'] {
  const grid = new Map<string, PageGlyph[]>();
  for (const glyph of glyphs) {
    const key = `${Math.floor(glyph.matrix[4] / CELL_PT)},${Math.floor(glyph.matrix[5] / CELL_PT)}`;
    const cell = grid.get(key);
    if (cell) cell.push(glyph);
    else grid.set(key, [glyph]);
  }
  return (x0, y0, x1, y1, reach) => {
    const near: PageGlyph[] = [];
    for (let cx = Math.floor((x0 - reach) / CELL_PT); cx <= Math.floor((x1 + reach) / CELL_PT); cx += 1) {
      for (let cy = Math.floor((y0 - reach) / CELL_PT); cy <= Math.floor((y1 + reach) / CELL_PT); cy += 1) {
        near.push(...(grid.get(`${cx},${cy}`) ?? []));
      }
    }
    return near;
  };
}

const mapCache = new WeakMap<PageText, { glyphs: readonly PageGlyph[]; map: PageGlyphMap }>();

/** Every item of a page mapped once, cached on the `PageText` object so each
 * match on the page reuses it. */
export function pageGlyphMap(page: PageText, glyphs: readonly PageGlyph[]): PageGlyphMap {
  const cached = mapCache.get(page);
  if (cached && cached.glyphs === glyphs) return cached.map;
  const near = buildIndex(glyphs);
  const items = page.items.map((item) => {
    const [a, b, , , e, f] = item.transform;
    const length = Math.hypot(a, b) || 1;
    const endX = e + (a / length) * item.width;
    const endY = f + (b / length) * item.width;
    const candidates = near(Math.min(e, endX), Math.min(f, endY), Math.max(e, endX), Math.max(f, endY), item.height);
    return mapItemGlyphs(item, page.text.slice(item.start, item.end), candidates);
  });
  const map = { items, near };
  mapCache.set(page, { glyphs, map });
  return map;
}
