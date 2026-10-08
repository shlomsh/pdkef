import { describe, expect, it } from 'vitest';
import { createPageGeometry } from '../../geometry/coords.ts';
import { textInReadingOrder, wordsUnderBoxes, type PercentBox } from './textLayer.ts';
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

  it('splits two words a narrow space apart even when that space opens its line in the stream', () => {
    // The real health declaration's "לאומי" and "לביטחון": a space 0.244 em
    // wide, under the join gap, and stored before the letters of its line.
    const word = makeLine('bbb', { x: 0 });
    const next = makeLine('ccc', { x: 15 + 2.44 });
    const space: PageGlyph = { unicode: ' ', isSpace: false, matrix: [10, 0, 0, 10, 15, 400], width: 0.244 };
    const [words] = wordsUnderBoxes([space, ...word, ...next], geometry, [box(0, 40, 390, 405)]);
    expect(words).toEqual(['bbb', 'ccc']);
  });

  it('gives one entry per box, empty for a box that reaches no word', () => {
    const glyphs = makeLine('aaa bbb ccc');
    const boxes = [box(18, 37, 390, 405), box(200, 210, 390, 405)];
    const words = wordsUnderBoxes(glyphs, geometry, boxes);
    expect(words).toEqual([['bbb'], []]);
  });
});

describe('text drawn twice for a bold look (RED-62)', () => {
  const overprint = (chars: string, offset = 0.3) => {
    const first = makeLine(chars);
    const second = makeLine(chars, { x: offset, y: 400 + offset });
    // Stream order as a producer writes it: copy one, then copy two.
    return [...first, ...second];
  };
  const all = box(0, 100, 390, 405);

  it('reads a Latin word drawn twice once', () => {
    expect(textInReadingOrder(overprint('Hello'), geometry)).toBe('Hello');
    expect(wordsUnderBoxes(overprint('Hello'), geometry, [all])).toEqual([['Hello']]);
  });

  it('reads a Hebrew word drawn twice once, in order', () => {
    expect(wordsUnderBoxes(overprint('מולש'), geometry, [all])).toEqual([['שלומ']]);
    expect(textInReadingOrder(overprint('מולש'), geometry)).toBe('שלומ');
  });

  it('keeps the double letter of a word drawn once', () => {
    expect(wordsUnderBoxes(makeLine('Hello'), geometry, [all])).toEqual([['Hello']]);
  });

  it('keeps both copies of a character drawn half an em apart', () => {
    const glyphs = [...makeLine('a'), ...makeLine('a', { x: 5 })];
    expect(wordsUnderBoxes(glyphs, geometry, [all])).toEqual([['aa']]);
  });

  it('reads a word drawn three times in 0.1 em steps once', () => {
    const glyphs = [0, 1, 2].flatMap((step) => makeLine('Employee', { x: step }));
    expect(textInReadingOrder(glyphs, geometry)).toBe('Employee');
    expect(wordsUnderBoxes(glyphs, geometry, [all])).toEqual([['Employee']]);
  });

  it('keeps the glyph list itself untouched', () => {
    const glyphs = overprint('Hello');
    textInReadingOrder(glyphs, geometry);
    expect(glyphs).toHaveLength(10);
  });

  it('does not compare every glyph with every other on a big page', () => {
    // One long line, so only the overprint pass (not line grouping) calls hypot per glyph pair.
    const glyphs: PageGlyph[] = [];
    for (let i = 0; i < 20000; i += 1) {
      glyphs.push({
        unicode: 'abcdefghij'[i % 10],
        isSpace: false,
        matrix: [10, 0, 0, 10, i * 3, 100 + (i % 7) * 0.1],
        width: 0.5,
      });
    }
    // A counting wrapper (not vi.spyOn, which records every call), so a quadratic run fails instead
    // of exhausting memory recording millions of calls.
    const real = Math.hypot;
    let calls = 0;
    Math.hypot = (...values: number[]) => {
      calls += 1;
      return real(...values);
    };
    try {
      textInReadingOrder(glyphs, geometry);
      expect(calls).toBeLessThan(200000);
    } finally {
      Math.hypot = real;
    }
  });
});
