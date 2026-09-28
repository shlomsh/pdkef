/**
 * RED-12: which words of a covered page go back into its saved file, and
 * where. A covered page is saved as a picture; over it goes invisible text
 * for every word no box touches, so the rest of the page can still be
 * selected, searched and read aloud. Pure; no DOM, no pdf.js import.
 *
 * A word is a run of glyphs that follow on from each other along one
 * baseline with no space between them. If a box reaches into the core of any
 * of its glyphs, where covering it hides the letter, the whole word is left
 * out, never cut to letters, and is written nowhere in the file. A box that
 * only grazes an ascender, a descender or a side bearing leaves the letter
 * readable in the picture, so the word stays. The words keep the page's own glyph order and positions, so a
 * right-to-left line reads back exactly as the original's does.
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

export interface LayerGlyph {
  unicode: string;
  /** Pen position along the run's baseline, in ems from its first glyph. */
  x: number;
  /** Advance in ems. */
  width: number;
}

/** One run of kept words to write, invisibly, over the picture. */
export interface LayerRun {
  /** The run's characters in the page's own glyph order. */
  text: string;
  /** Em space of the run's first glyph into the page's top-left-origin
   * viewport (`PageGeometry`). */
  matrix: AffineTransform;
  glyphs: LayerGlyph[];
}

export interface TextLayerPlan {
  runs: LayerRun[];
  /** Words written. */
  kept: number;
  /** Words left out because a box reaches them. */
  dropped: number;
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
const BACKWARD_EM = 0.1;
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
 * both `planTextLayer` (drop the word) and `wordsUnderBoxes` (the word is
 * under this box) use to decide a box reaches a word. */
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

/**
 * Splits the page's glyphs into runs, in content order: glyphs that follow
 * on from each other along one baseline, the spaces between words included.
 */
export function groupRuns(glyphs: PageGlyph[]): PageGlyph[][] {
  const runs: PageGlyph[][] = [];
  let run: PageGlyph[] = [];
  let inverse: AffineTransform | null = null;
  let pen = 0;

  const close = () => {
    if (run.length > 0) runs.push(run);
    run = [];
    inverse = null;
  };

  for (const glyph of glyphs) {
    if (inverse && run.length > 0) {
      const at = applyAffineTransform({ x: glyph.matrix[4], y: glyph.matrix[5] }, inverse);
      const continues =
        sameShape(run[0].matrix, glyph.matrix) &&
        Math.abs(at.y) <= SAME_LINE_EM &&
        at.x - pen <= JOIN_GAP_EM &&
        at.x >= pen - Math.max(run[run.length - 1].width, 0) - BACKWARD_EM;
      if (!continues) close();
    }
    if (run.length === 0) {
      if (isBlank(glyph)) continue; // a run starts at a word
      try {
        inverse = invertAffineTransform(glyph.matrix);
      } catch {
        continue; // a degenerate text matrix shows nothing
      }
    }
    const at = applyAffineTransform({ x: glyph.matrix[4], y: glyph.matrix[5] }, inverse!);
    run.push(glyph);
    pen = at.x + glyph.width;
  }
  close();
  return runs;
}

/** A run's words: its glyphs split at blanks, as index ranges. */
function wordRanges(run: PageGlyph[]): [number, number][] {
  const ranges: [number, number][] = [];
  let start = -1;
  run.forEach((glyph, i) => {
    if (isBlank(glyph)) {
      if (start >= 0) ranges.push([start, i]);
      start = -1;
    } else if (start < 0) {
      start = i;
    }
  });
  if (start >= 0) ranges.push([start, run.length]);
  return ranges;
}

/**
 * Plans one covered page's invisible text: every word in `glyphs` (from
 * `readPageGlyphs`) that no box in `boxes` reaches, placed exactly where its
 * glyphs sit in the picture, with the spaces between kept words.
 */
export function planTextLayer(glyphs: PageGlyph[], geometry: PageGeometry, boxes: PercentBox[]): TextLayerPlan {
  const covers = boxes.map((box) => percentToViewport(geometry, box));
  const runs: LayerRun[] = [];
  let kept = 0;
  let dropped = 0;

  for (const run of groupRuns(glyphs)) {
    const keep = new Array<boolean>(run.length).fill(false);
    for (const [start, end] of wordRanges(run)) {
      const word = run.slice(start, end);
      if (covers.some((cover) => wordTouchesCover(geometry, word, cover))) {
        dropped += 1;
      } else {
        kept += 1;
        keep.fill(true, start, end);
      }
    }
    // A space is written only between two kept words; one beside a dropped
    // word would say where it was.
    const firstKept = keep.indexOf(true);
    const lastKept = keep.lastIndexOf(true);
    if (firstKept < 0) continue;
    const chosen = run.filter((glyph, i) => (keep[i] || (i > firstKept && i < lastKept && isBlank(glyph) && keep[i - 1])) && glyph.unicode.length > 0);

    const first = chosen[0].matrix;
    const inverse = invertAffineTransform(first);
    const layerGlyphs = chosen.map((glyph) => ({
      unicode: glyph.unicode,
      x: applyAffineTransform({ x: glyph.matrix[4], y: glyph.matrix[5] }, inverse).x,
      width: Math.max(glyph.width, 0),
    }));
    runs.push({
      text: layerGlyphs.map((glyph) => glyph.unicode).join(''),
      matrix: composeAffineTransforms(geometry.pdfToViewport, first),
      glyphs: layerGlyphs,
    });
  }

  return { runs, kept, dropped };
}

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

/** A word's glyphs, ordered by position along the run's baseline (nearest
 * the run's own frame; content order already advances along it, so this only
 * matters when it doesn't), then reversed into right-to-left reading order
 * when the word contains a strong RTL character. */
function orderedWordGlyphs(word: PageGlyph[]): PageGlyph[] {
  let ordered = word;
  try {
    const inverse = invertAffineTransform(word[0].matrix);
    ordered = [...word].sort((a, b) => {
      const ax = applyAffineTransform({ x: a.matrix[4], y: a.matrix[5] }, inverse).x;
      const bx = applyAffineTransform({ x: b.matrix[4], y: b.matrix[5] }, inverse).x;
      return ax - bx;
    });
  } catch {
    // A degenerate first glyph: keep content order rather than fail.
  }
  const text = ordered.map((glyph) => glyph.unicode).join('');
  return [...text].some((ch) => isStrongRTL(ch)) ? [...ordered].reverse() : ordered;
}

/**
 * RED-17: for each of `boxes` (same index), the words `planTextLayer` would
 * drop for that box alone, i.e. every word whose core the box reaches by the
 * exact rule `planTextLayer` uses. Each word's text is in logical reading
 * order (`orderedWordGlyphs`), words in a box's list are in the line's own
 * reading direction, and lines are ordered top to bottom. Pure.
 */
export function wordsUnderBoxes(glyphs: PageGlyph[], geometry: PageGeometry, boxes: PercentBox[]): string[][] {
  const covers = boxes.map((box) => percentToViewport(geometry, box));
  const perBox: { top: number; seq: number; text: string }[][] = boxes.map(() => []);
  let seq = 0;

  for (const run of groupRuns(glyphs)) {
    if (run.length === 0) continue;
    const words = wordRanges(run).map(([start, end]) => run.slice(start, end));
    const runIsRTL = words.some((word) => [...word.map((glyph) => glyph.unicode).join('')].some(isStrongRTL));
    const orderedWords = runIsRTL ? [...words].reverse() : words;
    const runTop = Math.min(...run.map((glyph) => glyphCore(geometry, glyph).y0));

    for (const word of orderedWords) {
      const text = orderedWordGlyphs(word)
        .map((glyph) => glyph.unicode)
        .join('');
      if (!text) continue;
      seq += 1;
      covers.forEach((cover, i) => {
        if (wordTouchesCover(geometry, word, cover)) {
          perBox[i].push({ top: runTop, seq, text });
        }
      });
    }
  }

  return perBox.map((words) =>
    [...words].sort((a, b) => a.top - b.top || a.seq - b.seq).map((word) => word.text),
  );
}

function wordTexts(runs: { glyphs: { unicode: string }[] }[]): string[] {
  return runs.flatMap((run) => run.glyphs.map((glyph) => glyph.unicode).join('').split(/\s+/)).filter(Boolean);
}

/**
 * RED-09: whether a saved page's text, read back as `glyphs`, is exactly what
 * `plan` wrote: no glyph under any box, and the same words, no more and no
 * fewer. A layer that fails is never trusted; the page is saved again as its
 * picture alone.
 */
export function textLayerReadsBack(
  plan: TextLayerPlan,
  glyphs: PageGlyph[],
  geometry: PageGeometry,
  boxes: PercentBox[],
): boolean {
  const covers = boxes.map((box) => percentToViewport(geometry, box));
  const underABox = glyphs.some(
    (glyph) => !isBlank(glyph) && covers.some((cover) => touches(glyphCore(geometry, glyph), cover)),
  );
  if (underABox) return false;
  const written = wordTexts(plan.runs).sort();
  const read = wordTexts(groupRuns(glyphs).map((run) => ({ glyphs: run }))).sort();
  return written.length === read.length && written.every((word, i) => word === read[i]);
}
