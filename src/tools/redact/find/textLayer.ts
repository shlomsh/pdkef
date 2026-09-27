/**
 * RED-12: which words of a covered page go back into its saved file, and
 * where. A covered page is saved as a picture; over it goes invisible text
 * for every word no box touches, so the rest of the page can still be
 * selected, searched and read aloud. Pure; no DOM, no pdf.js import.
 *
 * A word whose padded extent touches any box is left out whole, never cut to
 * letters: the extent is an estimate (pdf.js gives one advance per item, not
 * per glyph), and erring toward dropping a neighbour is the safe side.
 */

import {
  applyAffineTransform,
  composeAffineTransforms,
  type AffineTransform,
  type PageGeometry,
} from '../../../editor/geometry/coords.ts';
import {
  countChars,
  fractionBox,
  itemAxes,
  padBox,
  sliceFractions,
  type MeasureText,
  type PointBox,
} from './matchBoxes.ts';
import type { PageText, PercentBox } from './types.ts';

/** One word to write, invisibly, over the picture. */
export interface LayerWord {
  /** The word as it reads (logical order). */
  text: string;
  /** The same characters in the order they sit on the page, left to right
   * along the baseline. Extractors rebuild reading order from glyph
   * positions, so a right-to-left word is written the way every real
   * Hebrew or Arabic PDF writes it. */
  glyphs: string;
  /** Text space at font size 1, starting at the word's left end on its
   * baseline, into the page's top-left-origin viewport (`PageGeometry`). */
  matrix: AffineTransform;
  /** The word's length along its baseline, in text-space units. */
  advance: number;
}

export interface TextLayerPlan {
  words: LayerWord[];
  /** Words left out because a box touches them. */
  dropped: number;
}

const WORD_RE = /\S+/g;

/** Hebrew, Arabic and their presentation-form blocks. */
const RTL_CHAR_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
/** Letters and digits that keep their own left-to-right order inside a
 * right-to-left word (a number, a Latin abbreviation). */
const LTR_RUN_CHAR_RE = /[\p{Nd}A-Za-zÀ-ɏ]/u;
const MIRRORED: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' };

/**
 * A right-to-left word's characters in page order, left to right: the runs
 * are reversed, a right-to-left run's own characters are reversed and its
 * brackets mirrored, and a left-to-right run (digits, Latin) keeps its order.
 */
export function visualOrder(word: string): string {
  const chars = Array.from(word);
  if (!chars.some((ch) => RTL_CHAR_RE.test(ch))) return word;
  const runs: { ltr: boolean; chars: string[] }[] = [];
  for (const ch of chars) {
    const ltr = LTR_RUN_CHAR_RE.test(ch);
    const last = runs[runs.length - 1];
    if (last && last.ltr === ltr) last.chars.push(ch);
    else runs.push({ ltr, chars: [ch] });
  }
  return runs
    .reverse()
    .map((run) => (run.ltr ? run.chars.join('') : run.chars.reverse().map((ch) => MIRRORED[ch] ?? ch).join('')))
    .join('');
}

function toViewportBox(geometry: PageGeometry, box: PointBox): PointBox {
  const corners = [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x0, y: box.y1 },
    { x: box.x1, y: box.y1 },
  ].map((point) => applyAffineTransform(point, geometry.pdfToViewport));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function percentToViewport(geometry: PageGeometry, box: PercentBox): PointBox {
  const x0 = (box.left / 100) * geometry.width;
  const y0 = (box.top / 100) * geometry.height;
  return { x0, y0, x1: x0 + (box.width / 100) * geometry.width, y1: y0 + (box.height / 100) * geometry.height };
}

/** Touching counts: a word that reaches a box's edge is left out. */
function touches(a: PointBox, b: PointBox): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

/**
 * Plans one covered page's invisible text: every word of `page` that no box
 * in `boxes` (page-percent, as every Redact element stores them) touches,
 * placed where it sits in the picture.
 */
export function planTextLayer(
  page: PageText,
  geometry: PageGeometry,
  boxes: PercentBox[],
  measure: MeasureText = countChars,
): TextLayerPlan {
  const covers = boxes.map((box) => percentToViewport(geometry, box));
  const words: LayerWord[] = [];
  let dropped = 0;

  for (const item of page.items) {
    const str = page.text.slice(item.start, item.end);
    const [a, b, c, d] = item.transform;
    const scale = Math.hypot(a, b);
    if (!(scale > 0) || !(item.width > 0)) continue;
    const { u } = itemAxes(item);

    for (const match of str.matchAll(WORD_RE)) {
      const from = match.index ?? 0;
      const to = from + match[0].length;

      const padded = sliceFractions(item, str, from, to, measure);
      const reach = toViewportBox(geometry, padBox(fractionBox(item, padded.f0, padded.f1)));
      if (covers.some((cover) => touches(reach, cover))) {
        dropped += 1;
        continue;
      }

      const { f0, f1 } = sliceFractions(item, str, from, to, measure, 0);
      const start = { x: item.transform[4] + u.x * item.width * f0, y: item.transform[5] + u.y * item.width * f0 };
      const matrix = composeAffineTransforms(geometry.pdfToViewport, [a, b, c, d, start.x, start.y]);
      words.push({
        text: match[0],
        glyphs: item.rtl ? visualOrder(match[0]) : match[0],
        matrix,
        advance: (item.width * (f1 - f0)) / scale,
      });
    }
  }

  return { words, dropped };
}
