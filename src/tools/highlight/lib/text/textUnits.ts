// The word or the sentence under a point on a digital page, from pdf.js text items in page percent
// (top-left origin). Pure: lines are found from item geometry, words and sentences from
// Intl.Segmenter over the joined strings, and each character offset is mapped back to its item.
import { directionAtPoint } from '#editor/highlight/resolveDirection.ts';
import type { PageTextItem } from '#lib/pdf/pdfTextItems.ts';

/** A box in page percent, top-left origin. */
export interface Box { left: number; top: number; width: number; height: number }
type Point = { x: number; y: number };

const LINE_TOLERANCE = 0.5;       // item heights between the vertical centers of items on one line
const SPACE_GAP = 0.25;           // line heights: a wider gap between items reads as a space
const PARAGRAPH_GAP = 1.5;        // line heights: lines closer than this share a paragraph

/** A run of the joined line string that came from one item. */
interface Piece { item: PageTextItem; start: number; end: number }

interface Line {
  items: PageTextItem[];          // reading order
  rtl: boolean;
  text: string;
  pieces: Piece[];
  top: number;
  bottom: number;
  height: number;
}

const centerOf = (i: PageTextItem) => i.top + i.height / 2;

/** Items grouped by vertical center, top to bottom. */
function groupLines(items: PageTextItem[]): PageTextItem[][] {
  const sorted = items.filter((i) => i.str.length > 0).sort((a, b) => centerOf(a) - centerOf(b));
  const groups: PageTextItem[][] = [];
  for (const it of sorted) {
    const group = groups[groups.length - 1];
    if (group) {
      const height = Math.max(...group.map((g) => g.height), it.height);
      const center = group.reduce((sum, g) => sum + centerOf(g), 0) / group.length;
      if (Math.abs(centerOf(it) - center) <= LINE_TOLERANCE * height) {
        group.push(it);
        continue;
      }
    }
    groups.push([it]);
  }
  return groups;
}

function buildLine(group: PageTextItem[]): Line {
  const top = Math.min(...group.map((i) => i.top));
  const bottom = Math.max(...group.map((i) => i.top + i.height));
  const height = bottom - top;
  const probe = { x: Math.min(...group.map((i) => i.left)), y: (top + bottom) / 2 };
  const rtl = directionAtPoint(group, probe) === 'rtl';
  const items = [...group].sort((a, b) => (rtl ? b.left - a.left : a.left - b.left));
  let text = '';
  const pieces: Piece[] = [];
  items.forEach((it, index) => {
    const prev = items[index - 1];
    if (prev) {
      const gap = rtl ? prev.left - (it.left + it.width) : it.left - (prev.left + prev.width);
      if (gap > SPACE_GAP * height) text += ' ';
    }
    pieces.push({ item: it, start: text.length, end: text.length + it.str.length });
    text += it.str;
  });
  return { items, rtl, text, pieces, top, bottom, height };
}

/** The character offset in the line text under pt, or null when pt is on no item. */
function offsetAt(line: Line, pt: Point): number | null {
  for (const piece of line.pieces) {
    const { item } = piece;
    if (pt.x < item.left || pt.x > item.left + item.width) continue;
    if (pt.y < item.top || pt.y > item.top + item.height) continue;
    const along = line.rtl ? item.left + item.width - pt.x : pt.x - item.left;
    const n = item.str.length;
    const index = Math.min(n - 1, Math.max(0, Math.floor((along / item.width) * n)));
    return piece.start + index;
  }
  return null;
}

/** The box a character range [from, to) of one line covers, or null when it touches no item. */
function lineBox(line: Line, from: number, to: number): Box | null {
  let left = Infinity;
  let right = -Infinity;
  for (const { item, start, end } of line.pieces) {
    const lo = Math.max(from, start);
    const hi = Math.min(to, end);
    if (lo >= hi) continue;
    const f0 = (lo - start) / item.str.length;
    const f1 = (hi - start) / item.str.length;
    const a = line.rtl ? item.left + (1 - f1) * item.width : item.left + f0 * item.width;
    const b = line.rtl ? item.left + (1 - f0) * item.width : item.left + f1 * item.width;
    left = Math.min(left, a);
    right = Math.max(right, b);
  }
  return right > left ? { left, top: line.top, width: right - left, height: line.height } : null;
}

/** The segment holding offset, trimmed of surrounding whitespace; null for a gap or non-word segment. */
function segmentAt(text: string, offset: number, locale: string, granularity: 'word' | 'sentence'): [number, number] | null {
  for (const seg of new Intl.Segmenter(locale, { granularity }).segment(text)) {
    const start = seg.index;
    const end = start + seg.segment.length;
    if (offset < start || offset >= end) continue;
    if (granularity === 'word' && !seg.isWordLike) return null;
    const lead = seg.segment.length - seg.segment.trimStart().length;
    const trail = seg.segment.length - seg.segment.trimEnd().length;
    const from = start + lead;
    const to = end - trail;
    return offset >= from && offset < to ? [from, to] : null;
  }
  return null;
}

/** The line holding the item under pt, with the offset of pt in its text. */
function locate(lines: Line[], pt: Point): { index: number; offset: number } | null {
  for (let index = 0; index < lines.length; index += 1) {
    const offset = offsetAt(lines[index], pt);
    if (offset !== null) return { index, offset };
  }
  return null;
}

/** One box, the word under pt; null when pt is not on a word. */
export function wordBoxes(items: PageTextItem[], pt: Point, locale: string): Box[] | null {
  const lines = groupLines(items).map(buildLine);
  const hit = locate(lines, pt);
  if (!hit) return null;
  const line = lines[hit.index];
  const range = segmentAt(line.text, hit.offset, locale, 'word');
  const box = range && lineBox(line, range[0], range[1]);
  return box ? [box] : null;
}

/** One box per line the sentence under pt covers, in reading order; null when pt is not on text. */
export function sentenceBoxes(items: PageTextItem[], pt: Point, locale: string): Box[] | null {
  const lines = groupLines(items).map(buildLine);
  const hit = locate(lines, pt);
  if (!hit) return null;
  let first = hit.index;
  let last = hit.index;
  const gapBetween = (a: Line, b: Line) => b.top - a.bottom;
  while (first > 0 && gapBetween(lines[first - 1], lines[first]) < PARAGRAPH_GAP * lines[first].height) first -= 1;
  while (last < lines.length - 1 && gapBetween(lines[last], lines[last + 1]) < PARAGRAPH_GAP * lines[last].height) last += 1;
  const paragraph = lines.slice(first, last + 1);
  let text = '';
  const starts = paragraph.map((line, index) => {
    if (index > 0) text += ' ';
    const start = text.length;
    text += line.text;
    return start;
  });
  const range = segmentAt(text, starts[hit.index - first] + hit.offset, locale, 'sentence');
  if (!range) return null;
  const boxes: Box[] = [];
  paragraph.forEach((line, index) => {
    const start = starts[index];
    const box = lineBox(line, range[0] - start, range[1] - start);
    if (box) boxes.push(box);
  });
  return boxes.length ? boxes : null;
}
