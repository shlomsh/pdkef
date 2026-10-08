/**
 * RED-02: turns a page's raw pdf.js text items into `PageText` (see
 * `types.ts`): one string per page, in reading order, with each item's
 * `[start, end)` range recorded against that string. Pure; no DOM, no pdf.js
 * import.
 */

import type { PageText, PlacedItem, TextItemLike } from './types.ts';

const UPRIGHT_EPS = 1e-5;

/** Hebrew, Arabic and their presentation-form blocks. */
const RTL_LETTER_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

/** True when most of a string's letters fall in an RTL script block. */
function isMostlyRtl(str: string): boolean {
  let letters = 0;
  let rtl = 0;
  for (const ch of str) {
    if (!/\p{L}/u.test(ch)) continue;
    letters += 1;
    if (RTL_LETTER_RE.test(ch)) rtl += 1;
  }
  if (letters === 0) return false;
  return rtl / letters > 0.5;
}

/** An item's own reading direction: `dir`, falling back to its script. */
function isRtlItem(item: TextItemLike): boolean {
  if (item.dir === 'rtl') return true;
  if (item.dir === 'ltr') return false;
  return isMostlyRtl(item.str);
}

/** Upright glyph space: no shear/rotation and not mirrored. */
function isUpright(transform: number[]): boolean {
  const [a, b, c] = transform;
  return Math.abs(b) < UPRIGHT_EPS && Math.abs(c) < UPRIGHT_EPS && a > 0;
}

interface Entry {
  item: TextItemLike;
  index: number;
}

interface Line {
  entries: Entry[];
  rtl: boolean;
}

/** Clusters upright entries into lines by baseline proximity, top to bottom. */
function clusterUprightLines(entries: Entry[]): Entry[][] {
  const sorted = [...entries].sort((x, y) => y.item.transform[5] - x.item.transform[5]);
  const clusters: { y: number; height: number; entries: Entry[] }[] = [];
  for (const entry of sorted) {
    const y = entry.item.transform[5];
    const height = entry.item.height;
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(y - last.y) < 0.5 * Math.min(height, last.height)) {
      last.entries.push(entry);
    } else {
      clusters.push({ y, height, entries: [entry] });
    }
  }
  return clusters.map((cluster) => cluster.entries);
}

/** Orders a line's entries in its own reading direction. */
function orderLine(entries: Entry[]): Line {
  const combined = entries.map((entry) => entry.item.str).join('');
  const rtl = isMostlyRtl(combined);
  const ordered = [...entries].sort((a, b) => {
    if (rtl) {
      const aRight = a.item.transform[4] + a.item.width;
      const bRight = b.item.transform[4] + b.item.width;
      return bRight - aRight;
    }
    return a.item.transform[4] - b.item.transform[4];
  });
  return { entries: ordered, rtl };
}

/** Gap between two consecutive items on a line, measured along reading direction. */
function readingGap(prev: TextItemLike, cur: TextItemLike, rtl: boolean): number {
  const prevLeft = prev.transform[4];
  const prevRight = prevLeft + prev.width;
  const curLeft = cur.transform[4];
  const curRight = curLeft + cur.width;
  return rtl ? prevLeft - curRight : curLeft - prevRight;
}

/** Whether two adjacent items on a line need an explicit ' ' between them:
 * only when there is a visible gap and neither side brings its own space.
 * Touching items are one word split into runs (kerning, a font change), and
 * a space there would break a search for that word. */
function needsSeparator(prev: TextItemLike, cur: TextItemLike, rtl: boolean): boolean {
  const gap = readingGap(prev, cur, rtl);
  const height = (prev.height + cur.height) / 2;
  const alreadyHasSpace = /\s$/.test(prev.str) || /^\s/.test(cur.str);
  return gap > 0.15 * height && !alreadyHasSpace;
}

/** True when `item` repeats `kept`: the same text at nearly the same place and
 * size, which is how a PDF fakes bold (the run drawn twice, a hair apart). */
function overprints(kept: TextItemLike, item: TextItemLike): boolean {
  if (kept.str.trim() !== item.str.trim()) return false;
  const height = Math.max(kept.height, item.height);
  if (height <= 0 || Math.abs(kept.height - item.height) > 0.05 * height) return false;
  const reach = 0.15 * height;
  return Math.abs(kept.transform[4] - item.transform[4]) <= reach && Math.abs(kept.transform[5] - item.transform[5]) <= reach;
}

/**
 * Builds one page's searchable text in reading order: upright items grouped
 * into baseline lines (top to bottom, each ordered right-to-left or
 * left-to-right per its own script), then any rotated/skewed items as their
 * own one-item lines in stream order. See `types.ts` for the full contract.
 */
export function buildPageText(pageIndex: number, items: TextItemLike[]): PageText {
  const entries: Entry[] = [];
  items.forEach((item, index) => {
    if (typeof item.str !== 'string' || item.str.trim() === '') return;
    if (entries.some((kept) => overprints(kept.item, item))) return;
    entries.push({ item, index });
  });

  const uprightEntries = entries.filter((entry) => isUpright(entry.item.transform));
  const rotatedEntries = entries
    .filter((entry) => !isUpright(entry.item.transform))
    .sort((a, b) => a.index - b.index);

  const lines: Line[] = [
    ...clusterUprightLines(uprightEntries).map(orderLine),
    ...rotatedEntries.map((entry) => ({ entries: [entry], rtl: false })),
  ];

  let text = '';
  const placedItems: PlacedItem[] = [];

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) text += '\n';
    line.entries.forEach((entry, i) => {
      if (i > 0) {
        const prev = line.entries[i - 1].item;
        text += needsSeparator(prev, entry.item, line.rtl) ? ' ' : '';
      }
      const start = text.length;
      text += entry.item.str;
      const end = text.length;
      placedItems.push({
        start,
        end,
        transform: entry.item.transform,
        width: entry.item.width,
        height: entry.item.height,
        rtl: isRtlItem(entry.item),
      });
    });
  });

  return { pageIndex, text, items: placedItems };
}
