/**
 * RED-17: which words of a page a set of boxes reaches. A covered page is now
 * saved as a picture alone, with no text layer (2026-09-28), so this module
 * exists only to answer the saved-file check's question - "what did the
 * boxes on this page cover?" - by the same touch rule the flatten pass would
 * use if it still wrote text. Pure; no DOM, no pdf.js import.
 *
 * A word is a run of glyphs that follow on from each other along one
 * baseline with no space between them. If a box reaches into the core of any
 * of its glyphs, where covering it hides the letter, the whole word counts as
 * covered. A box that only grazes an ascender, a descender or a side bearing
 * leaves the letter readable in the picture, so the word does not count.
 */

import {
  applyAffineTransform,
  composeAffineTransforms,
  invertAffineTransform,
  type AffineTransform,
  type PageGeometry,
} from '../../geometry/coords.ts';
import type { PageGlyph } from './pageGlyphs.ts';

/** Page-percent box, top-left origin: what every Redact element stores. */
export interface PercentBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A glyph's core, in ems: from just under the baseline to x-height and
 * a little over, inset from its sides by up to `SIDE_INSET_EM` (never more
 * than `SIDE_INSET_SHARE` of a narrow glyph's width). On the Latin and Hebrew
 * forms, a line's cores sit clear of the lines above and below, which a
 * full-em box did not: at 1.04 line spacing it reached the next line. */
const CORE_BOTTOM_EM = -0.15;
const CORE_TOP_EM = 0.7;
const SIDE_INSET_EM = 0.15;
const SIDE_INSET_SHARE = 0.3;
/** How far off a word's baseline, or ahead of the pen, the next glyph may sit
 * and still continue that word, in ems. */
const SAME_LINE_EM = 0.2;
const JOIN_GAP_EM = 0.25;
/** Two glyphs belong to one word only at nearly the same size and angle. */
const SAME_SHAPE = 0.01;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function glyphCore(geometry: PageGeometry, glyph: PageGlyph): Box {
  const toViewport = composeAffineTransforms(geometry.pdfToViewport, glyph.matrix);
  const w = Math.max(glyph.width, 0);
  const inset = Math.min(SIDE_INSET_EM, SIDE_INSET_SHARE * w);
  const corners = [
    { x: inset, y: CORE_BOTTOM_EM },
    { x: w - inset, y: CORE_BOTTOM_EM },
    { x: inset, y: CORE_TOP_EM },
    { x: w - inset, y: CORE_TOP_EM },
  ].map((point) => applyAffineTransform(point, toViewport));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function percentToViewport(geometry: PageGeometry, box: PercentBox): Box {
  const x0 = (box.left / 100) * geometry.width;
  const y0 = (box.top / 100) * geometry.height;
  return { x0, y0, x1: x0 + (box.width / 100) * geometry.width, y1: y0 + (box.height / 100) * geometry.height };
}

/** Touching counts: a core that reaches a box's edge is under it. */
function touches(a: Box, b: Box): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

/** Whether any glyph in `word` has a core that touches `cover`: the one rule
 * `wordsUnderBoxes` uses to decide a box reaches a word. */
function wordTouchesCover(geometry: PageGeometry, word: PageGlyph[], cover: Box): boolean {
  return word.some((glyph) => touches(glyphCore(geometry, glyph), cover));
}

function sameShape(a: AffineTransform, b: AffineTransform): boolean {
  const scale = Math.hypot(a[0], a[1]) + Math.hypot(a[2], a[3]);
  return [0, 1, 2, 3].every((k) => Math.abs(a[k] - b[k]) <= SAME_SHAPE * scale);
}

/** A space between words. A glyph with no Unicode value is not one: it stays
 * inside its word (and is not written), so it can't split a word in two. */
const isBlank = (glyph: PageGlyph) => glyph.isSpace || /^\s+$/.test(glyph.unicode);

/** Hebrew and Arabic letter ranges (plus their presentation forms): a
 * character in one of these is "strongly" right-to-left, the same signal
 * `PageText`'s own line-direction call uses. */
function isStrongRTL(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x0591 && code <= 0x08ff) ||
    (code >= 0xfb1d && code <= 0xfdff) ||
    (code >= 0xfe70 && code <= 0xfeff)
  );
}

/** A page's glyphs as lines: grouped by shape and baseline whatever order
 * they are stored in, each line sorted along its baseline. A right-to-left
 * line may be stored in visual order or one glyph at a time in reading
 * order; position is the only order both agree on. */
function positionalLines(glyphs: PageGlyph[]): { along: number; glyph: PageGlyph }[][] {
  const lines: { inverse: AffineTransform; first: PageGlyph; glyphs: { along: number; glyph: PageGlyph }[] }[] = [];
  const lineOf = (glyph: PageGlyph, origin: { x: number; y: number }) => lines.find((candidate) =>
    sameShape(candidate.first.matrix, glyph.matrix)
    && Math.abs(applyAffineTransform(origin, candidate.inverse).y) <= SAME_LINE_EM);
  // Blanks join a line the letters made but never start one, so they are
  // placed after every letter: a blank that came first in the stream (the
  // space that opens a run) would otherwise be dropped, and two words a space
  // apart in a font whose space is under JOIN_GAP_EM would read as one (RED-15).
  for (const glyph of glyphs) {
    if (isBlank(glyph)) continue;
    const origin = { x: glyph.matrix[4], y: glyph.matrix[5] };
    const line = lineOf(glyph, origin);
    if (line) {
      line.glyphs.push({ along: applyAffineTransform(origin, line.inverse).x, glyph });
      continue;
    }
    try {
      lines.push({ inverse: invertAffineTransform(glyph.matrix), first: glyph, glyphs: [{ along: 0, glyph }] });
    } catch {
      // A degenerate text matrix shows nothing.
    }
  }
  for (const glyph of glyphs) {
    if (!isBlank(glyph)) continue;
    const origin = { x: glyph.matrix[4], y: glyph.matrix[5] };
    const line = lineOf(glyph, origin);
    if (line) line.glyphs.push({ along: applyAffineTransform(origin, line.inverse).x, glyph });
  }
  return lines.map((line) => line.glyphs.sort((a, b) => a.along - b.along));
}

/** A sorted line's words: split at blanks and at gaps wider than a word's
 * own spacing, each word's glyphs left to right. */
function positionalWords(line: { along: number; glyph: PageGlyph }[]): PageGlyph[][] {
  const words: PageGlyph[][] = [];
  let word: PageGlyph[] = [];
  let end = -Infinity;
  for (const { along, glyph } of line) {
    if (isBlank(glyph) || along - end > JOIN_GAP_EM) {
      if (word.length > 0) words.push(word);
      word = [];
    }
    if (!isBlank(glyph)) word.push(glyph);
    end = Math.max(end, along + Math.max(glyph.width, 0));
  }
  if (word.length > 0) words.push(word);
  return words;
}

/** More than half of the letters are right-to-left: the same majority rule
 * Find's own line direction uses (find/pageText.ts), so a Latin line with one
 * Hebrew word still reads left to right, and the reverse. */
function isMostlyRTL(glyphs: PageGlyph[]): boolean {
  let letters = 0;
  let rtl = 0;
  for (const glyph of glyphs) {
    for (const ch of glyph.unicode) {
      if (!/\p{L}/u.test(ch)) continue;
      letters += 1;
      if (isStrongRTL(ch)) rtl += 1;
    }
  }
  return letters > 0 && rtl / letters > 0.5;
}

/** One line of a page's glyphs: its words (each left to right) and where its
 * top edge sits in the viewport, which is how lines are put top to bottom. */
interface ReadingLine {
  top: number;
  words: PageGlyph[][];
}

function readingLines(glyphs: PageGlyph[], geometry: PageGeometry): ReadingLine[] {
  const lines: ReadingLine[] = [];
  for (const line of positionalLines(glyphs)) {
    const words = positionalWords(line);
    if (words.length === 0) continue;
    lines.push({ top: Math.min(...words.flat().map((glyph) => glyphCore(geometry, glyph).y0)), words });
  }
  return lines;
}

/** A word as text in logical order: a right-to-left word is stored left to
 * right by position, so it is reversed. */
const wordText = (word: PageGlyph[]) =>
  (isMostlyRTL(word) ? [...word].reverse() : word).map((glyph) => glyph.unicode).join('');

/** One line's words as text in reading order: the line's own direction (the
 * majority of its letters) decides whether it starts from the right. */
function lineTexts(words: PageGlyph[][]): string[] {
  const ordered = isMostlyRTL(words.flat()) ? [...words].reverse() : words;
  return ordered.map(wordText).filter(Boolean);
}

/**
 * RED-16: the text of `glyphs` as a person reads it, one string: lines top to
 * bottom, each line's words in its own direction, joined with single spaces.
 * The same positional reading `wordsUnderBoxes` does for the saved-file check,
 * so Delete's preview and the check never disagree about a Hebrew line.
 * `geometry` is the page's, to tell which line is higher. Pure.
 */
export function textInReadingOrder(glyphs: PageGlyph[], geometry: PageGeometry): string {
  return readingLines(glyphs, geometry)
    .sort((a, b) => a.top - b.top)
    .flatMap((line) => lineTexts(line.words))
    .join(' ');
}

/**
 * RED-17: for each of `boxes` (same index), the words a box reaches (any
 * glyph core touching it), as text in logical reading order. Words are built
 * from glyph positions, not storage order, so a Hebrew line reads the same
 * however its bytes are stored. A box's words on one line read in the
 * direction most of their own letters have, each word likewise; lines go top
 * to bottom. Pure.
 */
export function wordsUnderBoxes(glyphs: PageGlyph[], geometry: PageGeometry, boxes: PercentBox[]): string[][] {
  const covers = boxes.map((box) => percentToViewport(geometry, box));
  const perBox: { top: number; texts: string[] }[][] = boxes.map(() => []);

  for (const { top, words } of readingLines(glyphs, geometry)) {
    covers.forEach((cover, i) => {
      const reached = words.filter((word) => wordTouchesCover(geometry, word, cover));
      if (reached.length === 0) return;
      perBox[i].push({ top, texts: lineTexts(reached) });
    });
  }

  return perBox.map((lines) => [...lines].sort((a, b) => a.top - b.top).flatMap((line) => line.texts));
}
