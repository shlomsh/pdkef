import { describe, expect, it } from 'vitest';
import { readPageGlyphs, type TextOps, type GlyphFontInfo } from './pageGlyphs.ts';

// Distinct numbers for every key of TextOps, so a wrong branch shows up as a
// wrong-looking glyph rather than silently matching another op.
const OPS: TextOps = {
  save: 1,
  restore: 2,
  transform: 3,
  paintFormXObjectBegin: 4,
  paintFormXObjectEnd: 5,
  beginText: 6,
  setCharSpacing: 7,
  setWordSpacing: 8,
  setHScale: 9,
  setLeading: 10,
  setLeadingMoveText: 11,
  setFont: 12,
  setTextRise: 13,
  moveText: 14,
  setTextMatrix: 15,
  nextLine: 16,
  showText: 17,
  setGState: 18,
  setTextRenderingMode: 19,
};

const DEFAULT_FONT_MATRIX = [0.001, 0, 0, 0.001, 0, 0];

function fontInfo(overrides: Partial<GlyphFontInfo> = {}): (name: string) => GlyphFontInfo {
  return () => ({ fontMatrix: DEFAULT_FONT_MATRIX, ...overrides });
}

function glyph(unicode: string, width: number, isSpace = false) {
  return { unicode, width, isSpace };
}

/** Builds a fnArray/argsArray pair from [op, ...args] rows. */
function opList(rows: [number, ...any[]][]) {
  return {
    fnArray: rows.map((r) => r[0]),
    argsArray: rows.map((r) => r.slice(1)),
  };
}

describe('readPageGlyphs', () => {
  it('leaves out invisible text (render modes 3 and 7), such as a scan\'s OCR layer', () => {
    const list = opList([
      [OPS.beginText],
      [OPS.setFont, 'F1', 10],
      [OPS.setTextMatrix, [1, 0, 0, 1, 0, 0]],
      [OPS.setTextRenderingMode, 3],
      [OPS.showText, [glyph('o', 500)]],
      [OPS.setTextRenderingMode, 7],
      [OPS.showText, [glyph('c', 500)]],
      [OPS.setTextRenderingMode, 0],
      [OPS.showText, [glyph('v', 500)]],
    ]);
    expect(readPageGlyphs(list, OPS, fontInfo()).map((g) => g.unicode)).toEqual(['v']);
  });

  it('places glyph origins from setTextMatrix and showText widths', () => {
    const list = opList([
      [OPS.beginText],
      [OPS.setFont, 'F1', 10],
      [OPS.setTextMatrix, [1, 0, 0, 1, 100, 200]],
      [OPS.showText, [glyph('a', 500), glyph('b', 250)]],
    ]);
    const glyphs = readPageGlyphs(list, OPS, fontInfo());
    expect(glyphs).toHaveLength(2);
    expect(glyphs[0].matrix[4]).toBeCloseTo(100);
    expect(glyphs[0].matrix[5]).toBeCloseTo(200);
    // 500 units at fontMatrix 0.001 * fontSize 10 = 5pt advance.
    expect(glyphs[1].matrix[4]).toBeCloseTo(105);
    expect(glyphs[1].matrix[5]).toBeCloseTo(200);
  });

  it('reads width in ems (glyph width * fontMatrix[0])', () => {
    const list = opList([
      [OPS.beginText],
      [OPS.setFont, 'F1', 10],
      [OPS.setTextMatrix, [1, 0, 0, 1, 0, 0]],
      [OPS.showText, [glyph('a', 500)]],
    ]);
    const [g] = readPageGlyphs(list, OPS, fontInfo());
    // width * fontMatrix[0] = 500 * 0.001 = 0.5 em.
    expect(g.width).toBeCloseTo(0.5);
  });

  it('moves the next glyph left by a TJ number', () => {
    const list = opList([
      [OPS.beginText],
      [OPS.setFont, 'F1', 10],
      [OPS.setTextMatrix, [1, 0, 0, 1, 0, 0]],
      [OPS.showText, [glyph('a', 0), 250, glyph('b', 0)]],
    ]);
    const glyphs = readPageGlyphs(list, OPS, fontInfo());
    // A TJ number of 250 at font size 10 moves by 250/1000 * 10 = 2.5pt left.
    expect(glyphs[0].matrix[4]).toBeCloseTo(0);
    expect(glyphs[1].matrix[4]).toBeCloseTo(-2.5);
  });

  it('applies char spacing to every glyph and word spacing only after a space glyph', () => {
    const list = opList([
      [OPS.beginText],
      [OPS.setFont, 'F1', 10],
      [OPS.setCharSpacing, 1],
      [OPS.setWordSpacing, 2],
      [OPS.setTextMatrix, [1, 0, 0, 1, 0, 0]],
      [OPS.showText, [glyph('a', 0), glyph(' ', 0, true), glyph('b', 0)]],
    ]);
    const glyphs = readPageGlyphs(list, OPS, fontInfo());
    expect(glyphs[0].matrix[4]).toBeCloseTo(0);
    // After 'a': charSpacing 1pt advance.
    expect(glyphs[1].matrix[4]).toBeCloseTo(1);
    // After the space glyph: charSpacing 1 + wordSpacing 2 = 3pt further.
    expect(glyphs[2].matrix[4]).toBeCloseTo(4);
  });

  it('halves advances and the matrix x scale under 50% horizontal scale', () => {
    const list = opList([
      [OPS.beginText],
      [OPS.setFont, 'F1', 10],
      [OPS.setHScale, 50],
      [OPS.setTextMatrix, [1, 0, 0, 1, 0, 0]],
      [OPS.showText, [glyph('a', 500), glyph('b', 0)]],
    ]);
    const glyphs = readPageGlyphs(list, OPS, fontInfo());
    // Matrix x-scale is fontSize * hScale = 10 * 0.5 = 5.
    expect(glyphs[0].matrix[0]).toBeCloseTo(5);
    // Advance of 5pt (500 units at size 10) is halved to 2.5pt.
    expect(glyphs[1].matrix[4]).toBeCloseTo(2.5);
  });

  it('moves the pen with moveText/nextLine honoring setLeading', () => {
    const list = opList([
      [OPS.beginText],
      [OPS.setFont, 'F1', 10],
      [OPS.setLeading, 12],
      [OPS.setTextMatrix, [1, 0, 0, 1, 0, 0]],
      [OPS.moveText, 5, 0],
      [OPS.showText, [glyph('a', 0)]],
      [OPS.nextLine],
      [OPS.showText, [glyph('b', 0)]],
    ]);
    const glyphs = readPageGlyphs(list, OPS, fontInfo());
    expect(glyphs[0].matrix[4]).toBeCloseTo(5);
    expect(glyphs[0].matrix[5]).toBeCloseTo(0);
    // setLeading(12) stores leading as -args[0] = -12; nextLine moves by (0, leading).
    expect(glyphs[1].matrix[4]).toBeCloseTo(5);
    expect(glyphs[1].matrix[5]).toBeCloseTo(-12);
  });

  it('restores the CTM and font on save/restore', () => {
    const list = opList([
      [OPS.beginText],
      [OPS.setFont, 'F1', 10],
      [OPS.setTextMatrix, [1, 0, 0, 1, 0, 0]],
      [OPS.save],
      [OPS.transform, 1, 0, 0, 1, 100, 0],
      [OPS.setFont, 'F2', 20],
      [OPS.showText, [glyph('a', 0)]],
      [OPS.restore],
      [OPS.showText, [glyph('b', 0)]],
    ]);
    const glyphs = readPageGlyphs(list, OPS, fontInfo());
    // Inside save/restore: ctm translated by 100, font size 20.
    expect(glyphs[0].matrix[4]).toBeCloseTo(100);
    expect(glyphs[0].matrix[0]).toBeCloseTo(20);
    // After restore: back to the un-translated ctm and font size 10.
    expect(glyphs[1].matrix[4]).toBeCloseTo(0);
    expect(glyphs[1].matrix[0]).toBeCloseTo(10);
  });

  it('composes and restores the CTM around a form XObject', () => {
    const list = opList([
      [OPS.beginText],
      [OPS.setFont, 'F1', 10],
      [OPS.setTextMatrix, [1, 0, 0, 1, 0, 0]],
      [OPS.paintFormXObjectBegin, [1, 0, 0, 1, 50, 0]],
      [OPS.showText, [glyph('a', 0)]],
      [OPS.paintFormXObjectEnd],
      [OPS.showText, [glyph('b', 0)]],
    ]);
    const glyphs = readPageGlyphs(list, OPS, fontInfo());
    expect(glyphs[0].matrix[4]).toBeCloseTo(50);
    expect(glyphs[1].matrix[4]).toBeCloseTo(0);
  });

  it('skips glyphs from a vertical font', () => {
    const list = opList([
      [OPS.beginText],
      [OPS.setFont, 'F1', 10],
      [OPS.setTextMatrix, [1, 0, 0, 1, 0, 0]],
      [OPS.showText, [glyph('a', 500)]],
    ]);
    const glyphs = readPageGlyphs(list, OPS, fontInfo({ vertical: true }));
    expect(glyphs).toHaveLength(0);
  });

  it('switches font size through setGState', () => {
    const list = opList([
      [OPS.beginText],
      [OPS.setFont, 'F1', 10],
      [OPS.setTextMatrix, [1, 0, 0, 1, 0, 0]],
      [OPS.setGState, [['Font', ['F2', 12]]]],
      [OPS.showText, [glyph('a', 0)]],
    ]);
    const glyphs = readPageGlyphs(list, OPS, fontInfo());
    expect(glyphs[0].matrix[0]).toBeCloseTo(12);
  });
});
