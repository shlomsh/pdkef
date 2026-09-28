import { describe, expect, it } from 'vitest';
import { createPageGeometry } from '../../../editor/geometry/coords.ts';
import type { PageGlyph } from '../../../editor/adapters/pdf/pageGlyphs.ts';
import type { PercentBox } from '../find/types.ts';
import { coveredTerms, MIN_COVERED_CHARS } from './coveredTerms.ts';

const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 } });

/** Same fixture shape as `textLayer.test.ts`: a line of glyphs at `y`
 * (PDF baseline), font size 10, each `widthEm` wide, spaced by their own
 * advance. */
function makeLine(chars: string, { x = 0, y = 400, size = 10, widthEm = 0.5 }: { x?: number; y?: number; size?: number; widthEm?: number } = {}): PageGlyph[] {
  let pen = x;
  const glyphs: PageGlyph[] = [];
  for (const ch of chars) {
    glyphs.push({ unicode: ch, isSpace: ch === ' ', matrix: [size, 0, 0, size, pen, y], width: widthEm });
    pen += widthEm * size;
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

describe('coveredTerms', () => {
  it('makes one covered term for the phrase a box covers', () => {
    const glyphs = makeLine('secret info here');
    // Reaches every word's core on the line.
    const boxes = [box(0, 100, 390, 405)];
    const terms = coveredTerms([{ glyphs, geometry, boxes }]);
    expect(terms).toHaveLength(1);
    expect(terms[0]).toMatchObject({ label: 'secret info here', source: 'covered' });
  });

  it('drops a phrase shorter than MIN_COVERED_CHARS non-space characters', () => {
    const glyphs = makeLine('a b');
    const boxes = [box(0, 100, 390, 405)];
    const terms = coveredTerms([{ glyphs, geometry, boxes }]);
    expect('ab'.length).toBeLessThan(MIN_COVERED_CHARS);
    expect(terms).toHaveLength(0);
  });

  it('dedupes identical labels, keeping the first', () => {
    const glyphsA = makeLine('secret info', { y: 400 });
    const glyphsB = makeLine('secret info', { y: 300 });
    const boxes = [box(0, 100, 390, 405)];
    const boxesB = [box(0, 100, 290, 305)];
    const terms = coveredTerms([
      { glyphs: glyphsA, geometry, boxes },
      { glyphs: glyphsB, geometry, boxes: boxesB },
    ]);
    expect(terms).toHaveLength(1);
  });

  it('gives a finder that matches the phrase in text with different spacing', () => {
    const glyphs = makeLine('secret info');
    const boxes = [box(0, 100, 390, 405)];
    const [term] = coveredTerms([{ glyphs, geometry, boxes }]);
    const text = 'found:  secret   info  right there';
    const matches = term.finder(text);
    expect(matches).toHaveLength(1);
    expect(text.slice(matches[0].start, matches[0].end)).toBe('secret   info');
  });
});
