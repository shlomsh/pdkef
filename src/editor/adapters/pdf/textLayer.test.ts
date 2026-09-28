import { describe, expect, it } from 'vitest';
import { createPageGeometry } from '../../geometry/coords.ts';
import { wordsUnderBoxes, type PercentBox } from './textLayer.ts';
import type { PageGlyph } from './pageGlyphs.ts';

const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 } });

/**
 * A line of glyphs at `y` (PDF baseline), font size 10, each `widthEm` wide
 * (default 0.5), spaced by their own advance. `dir` lets a caller lay the pen
 * out backwards; the fixtures for "keeps content order" instead give Hebrew
 * characters in the same left-to-right pen order real PDF producers write,
 * because a PDF's content stream advances the pen in the order the glyphs are
 * drawn, not the order they read in.
 */
function makeLine(
  chars: string,
  { x = 0, y = 400, size = 10, widthEm = 0.5, dir = 1 }: { x?: number; y?: number; size?: number; widthEm?: number; dir?: number } = {},
): PageGlyph[] {
  let pen = x;
  const glyphs: PageGlyph[] = [];
  for (const ch of chars) {
    glyphs.push({
      unicode: ch,
      isSpace: ch === ' ',
      matrix: [size, 0, 0, size, pen, y],
      width: widthEm,
    });
    pen += widthEm * size * dir;
  }
  return glyphs;
}

/** A percent box from viewport-pixel corners, for legible fixtures. */
function box(x0: number, x1: number, y0: number, y1: number): PercentBox {
  return {
    left: (x0 / geometry.width) * 100,
    top: (y0 / geometry.height) * 100,
    width: ((x1 - x0) / geometry.width) * 100,
    height: ((y1 - y0) / geometry.height) * 100,
  };
}

describe('wordsUnderBoxes', () => {
  it('gives the box over the middle Latin word only that word', () => {
    const glyphs = makeLine('aaa bbb ccc');
    // Covers the three "b" cores (x 20..35) without reaching either neighbour's core.
    const boxes = [box(18, 37, 390, 405)];
    const [words] = wordsUnderBoxes(glyphs, geometry, boxes);
    expect(words).toEqual(['bbb']);
  });

  it('gives a box spanning two words both, in reading order', () => {
    const glyphs = makeLine('aaa bbb ccc');
    // Wide enough to reach both "bbb" and "ccc"'s cores.
    const boxes = [box(18, 60, 390, 405)];
    const [words] = wordsUnderBoxes(glyphs, geometry, boxes);
    expect(words).toEqual(['bbb', 'ccc']);
  });

  it('reads a Hebrew word in logical order although its glyphs sit in visual (reversed) stream order', () => {
    // Content order as a real RTL PDF producer writes it: the pen still
    // advances left to right, but the characters are already the visual
    // (reversed) reading order, so the word's stream order is 'מולש', logical
    // (reversed) order 'שלומ'.
    const glyphs = makeLine('מולש');
    const boxes = [box(0, 100, 390, 405)];
    const [words] = wordsUnderBoxes(glyphs, geometry, boxes);
    expect(words).toEqual(['שלומ']);
  });

  it('reads a Hebrew line in the same logical order whichever order its bytes are stored in', () => {
    // "עולם שלום" drawn left to right as the reader sees it: stored in visual
    // order (pen moving right), and stored in logical order (pen moving left
    // from the right edge). A box over both words reads the same either way.
    const visual = makeLine('םולש םלוע', { x: 0 });
    const logical = makeLine('עולם שלום', { x: 40, dir: -1 });
    const boxes = [box(0, 100, 390, 405)];
    expect(wordsUnderBoxes(visual, geometry, boxes)[0]).toEqual(['עולם', 'שלום']);
    expect(wordsUnderBoxes(logical, geometry, boxes)[0]).toEqual(['עולם', 'שלום']);
  });

  it('keeps Latin words in order on a line that also has a Hebrew word', () => {
    // "Approved by John Smith, מנהל", the Hebrew word stored in visual order.
    // 5 units per glyph: "John " spans 60-85 and "Smith, " 85-120.
    const glyphs = makeLine('Approved by John Smith, להנמ');
    const [words] = wordsUnderBoxes(glyphs, geometry, [box(62, 112, 390, 405)]);
    expect(words).toEqual(['John', 'Smith,']);
  });

  it('gives one entry per box, empty for a box that reaches no word', () => {
    const glyphs = makeLine('aaa bbb ccc');
    const boxes = [box(18, 37, 390, 405), box(200, 210, 390, 405)];
    const words = wordsUnderBoxes(glyphs, geometry, boxes);
    expect(words).toEqual([['bbb'], []]);
  });
});
