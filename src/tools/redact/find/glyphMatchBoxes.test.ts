import { describe, expect, it } from 'vitest';
import type { PageGlyph } from '../../../editor/adapters/pdf/pageGlyphs.ts';
import { createPageGeometry } from '../../../editor/geometry/coords.ts';
import { glyphsBox } from './glyphBoxes.ts';
import { mapItemGlyphs, pageGlyphMap } from './itemGlyphs.ts';
import { matchBoxes } from './matchBoxes.ts';
import type { PageText, PlacedItem } from './types.ts';

const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 } });
const SIZE = 10;
const ADVANCE_EM = 0.5;

/** Glyphs laid out left to right from `x`, one per character, in the order
 * given (visual order for Hebrew). */
function line(chars: string, { x = 100, y = 700 }: { x?: number; y?: number } = {}): PageGlyph[] {
  return [...chars].map((ch, i) => ({
    unicode: ch,
    isSpace: ch === ' ',
    matrix: [SIZE, 0, 0, SIZE, x + i * ADVANCE_EM * SIZE, y],
    width: ADVANCE_EM,
  }));
}

/** An item over `glyphs` whose `str` is the text in reading order. */
function itemFor(str: string, glyphs: PageGlyph[], start = 0, rtl = false): PlacedItem {
  return {
    start,
    end: start + str.length,
    transform: [SIZE, 0, 0, SIZE, glyphs[0].matrix[4], glyphs[0].matrix[5]],
    width: glyphs.length * ADVANCE_EM * SIZE,
    height: SIZE,
    rtl,
  };
}

const pageOf = (text: string, items: PlacedItem[]): PageText => ({ pageIndex: 0, text, items });
const pt = (percent: number, of: number) => (percent / 100) * of;

describe('mapItemGlyphs', () => {
  it('ignores the copy of a glyph overprinted for a bold look (RED-62)', () => {
    const glyphs = line('Hello');
    const shifted = line('Hello', { x: 100.4, y: 700.3 });
    const both = [...glyphs, ...shifted];
    const mapped = mapItemGlyphs(itemFor('Hello', glyphs), 'Hello', both);
    expect(mapped).not.toBeNull();
    expect(mapped!.map((glyph) => glyph?.matrix[4])).toEqual(glyphs.map((glyph) => glyph.matrix[4]));
  });

  it('maps an LTR item character by character, skipping spaces', () => {
    const glyphs = line('ab cd');
    const mapped = mapItemGlyphs(itemFor('ab cd', glyphs), 'ab cd', glyphs);
    expect(mapped?.map((glyph) => glyph?.unicode ?? null)).toEqual(['a', 'b', null, 'c', 'd']);
  });

  it('reads a Hebrew item stored in visual order back in logical order', () => {
    // "שלום עולם" reads right to left, so its first letter is the rightmost.
    const logical = 'שלום עולם';
    const glyphs = line([...logical].reverse().join(''));
    const mapped = mapItemGlyphs(itemFor(logical, glyphs, 0, true), logical, glyphs);
    expect(mapped).not.toBeNull();
    const firstLetter = mapped![0]!;
    const lastLetter = mapped![logical.length - 1]!;
    expect(firstLetter.unicode).toBe('ש');
    expect(firstLetter.matrix[4]).toBeGreaterThan(lastLetter.matrix[4]);
    expect(lastLetter.unicode).toBe('ם');
  });

  it('reads the same item when its glyphs are stored one by one in reading order', () => {
    // Position is the only order both storage styles share.
    const logical = 'שלום';
    const glyphs = line([...logical].reverse().join(''));
    const stored = [...glyphs].reverse();
    const mapped = mapItemGlyphs(itemFor(logical, glyphs, 0, true), logical, stored);
    expect(mapped?.map((glyph) => glyph?.unicode)).toEqual([...logical]);
  });

  it('keeps a number inside Hebrew text reading left to right', () => {
    // Logical "שלום 123": visual left to right is "123 םולש".
    const glyphs = line('123 םולש');
    const mapped = mapItemGlyphs(itemFor('שלום 123', glyphs, 0, true), 'שלום 123', glyphs);
    expect(mapped?.map((glyph) => glyph?.unicode ?? null)).toEqual(['ש', 'ל', 'ו', 'ם', null, '1', '2', '3']);
    expect(mapped![5]!.matrix[4]).toBeLessThan(mapped![6]!.matrix[4]);
  });

  it('is null when the glyphs do not spell the text, so the caller estimates', () => {
    const glyphs = line('abXd');
    expect(mapItemGlyphs(itemFor('abcd', glyphs), 'abcd', glyphs)).toBeNull();
  });

  it('is null when the item has glyphs missing', () => {
    const glyphs = line('abc');
    expect(mapItemGlyphs(itemFor('abcd', glyphs), 'abcd', glyphs)).toBeNull();
  });

  it('expands a ligature glyph to the characters pdf.js reports for it', () => {
    const glyphs = [...line('of'), { ...line('x')[0], unicode: 'ﬁ', matrix: [SIZE, 0, 0, SIZE, 110, 700] as PageGlyph['matrix'] }];
    const mapped = mapItemGlyphs(itemFor('offi', glyphs), 'offi', glyphs);
    expect(mapped?.map((glyph) => glyph?.matrix[4])).toEqual([100, 105, 110, 110]);
  });

  it('ignores glyphs of another line', () => {
    const own = line('abc');
    const other = line('zzz', { y: 688 });
    expect(mapItemGlyphs(itemFor('abc', own), 'abc', [...own, ...other])?.length).toBe(3);
  });
});

describe('glyphsBox', () => {
  const none = () => [];

  it('covers the matched glyphs with the ink band and a 1 pt pad', () => {
    const glyphs = line('abc');
    const box = glyphsBox(glyphs, none)!;
    expect(box.x0).toBeCloseTo(99, 5);
    expect(box.x1).toBeCloseTo(100 + 3 * 5 + 1, 5);
    expect(box.y0).toBeCloseTo(700 - 2.5 - 1, 5);
    expect(box.y1).toBeCloseTo(700 + 9 + 1, 5);
  });

  it('draws the box back from the next line when the lines are 1.04 ems apart', () => {
    const own = line('abc');
    const above = line('xyz', { y: 700 + 10.4 });
    const below = line('xyz', { y: 700 - 10.4 });
    const box = glyphsBox(own, () => [...above, ...below])!;
    // The line above has its cores from 10.4 - 1.5 = 8.9 pt up; below, down to -10.4 + 7 = -3.4 pt.
    expect(box.y1).toBeLessThan(700 + 8.9);
    expect(box.y0).toBeGreaterThan(700 - 3.4);
    // It still holds its own cores: -1.5 pt to 7 pt.
    expect(box.y1).toBeGreaterThanOrEqual(700 + 7);
    expect(box.y0).toBeLessThanOrEqual(700 - 1.5);
  });

  it('keeps the matched glyphs whole when a neighbour sits right on them', () => {
    const own = line('abc');
    const box = glyphsBox(own, () => line('abc'))!;
    expect(box.x0).toBeLessThanOrEqual(100);
    expect(box.x1).toBeGreaterThanOrEqual(115);
  });

  it('gives the cores alone for the core shape', () => {
    const [glyph] = line('a');
    const box = glyphsBox([glyph], none, 'core')!;
    // Inset 0.15 em = 1.5 pt each side of a 5 pt advance; -0.15 to 0.7 em.
    expect(box.x0).toBeCloseTo(101.5, 5);
    expect(box.x1).toBeCloseTo(103.5, 5);
    expect(box.y0).toBeCloseTo(698.5, 5);
    expect(box.y1).toBeCloseTo(707, 5);
  });

  it('follows rotated text', () => {
    const angle = Math.PI / 6;
    const c = Math.cos(angle) * SIZE;
    const s = Math.sin(angle) * SIZE;
    const glyph: PageGlyph = { unicode: 'a', isSpace: false, matrix: [c, s, -s, c, 200, 300], width: 1 };
    const box = glyphsBox([glyph], none, 'core')!;
    // Wider and taller than the upright 0.7 x ~0.85 em core.
    expect(box.x1 - box.x0).toBeGreaterThan(0.7 * SIZE);
    expect(box.y1 - box.y0).toBeGreaterThan(0.85 * SIZE);
  });

  it('is null for no glyphs', () => {
    expect(glyphsBox([], none)).toBeNull();
  });
});

describe('matchBoxes from glyphs', () => {
  it('boxes the middle word of one item on its own letters, not an apportioned share', () => {
    // "iiiiWW": the advances are not equal, so apportioning would be off.
    const glyphs: PageGlyph[] = [];
    let pen = 100;
    for (const ch of 'iiiiWW') {
      const width = ch === 'W' ? 1 : 0.25;
      glyphs.push({ unicode: ch, isSpace: false, matrix: [SIZE, 0, 0, SIZE, pen, 700], width });
      pen += width * SIZE;
    }
    const item: PlacedItem = { start: 0, end: 6, transform: [SIZE, 0, 0, SIZE, 100, 700], width: pen - 100, height: SIZE, rtl: false };
    const page = pageOf('iiiiWW', [item]);
    const [box] = matchBoxes(page, { start: 4, end: 6 }, geometry, undefined, 'cover', glyphs);
    // The WW sit at 110..130, so a 1 pt pad would start at 109. The last "i"
    // has its core to 109.25, so the box stops 0.05 pt clear of it.
    expect(pt(box.left, 600)).toBeCloseTo(109.3, 3);
    expect(pt(box.left + box.width, 600)).toBeCloseTo(131, 3);
  });

  it('puts a Hebrew word on the left of a line when it reads second', () => {
    const logical = 'שלום עולם';
    const glyphs = line([...logical].reverse().join(''));
    const page = pageOf(logical, [itemFor(logical, glyphs, 0, true)]);
    const [box] = matchBoxes(page, { start: 5, end: 9 }, geometry, undefined, 'cover', glyphs);
    // "עולם" is the last four letters read, so the leftmost four drawn: 100..120.
    expect(pt(box.left, 600)).toBeCloseTo(99, 3);
    expect(pt(box.left + box.width, 600)).toBeCloseTo(121, 3);
  });

  it('boxes one line of a match that spans two, from the glyphs of each', () => {
    const first = line('First', { y: 700 });
    const second = line('Second', { y: 680 });
    const page = pageOf('First\nSecond', [itemFor('First', first, 0), itemFor('Second', second, 6)]);
    const boxes = matchBoxes(page, { start: 3, end: 9 }, geometry, undefined, 'cover', [...first, ...second]);
    expect(boxes).toHaveLength(2);
  });

  it('falls back to the estimate for an item whose glyphs do not spell it, and keeps the rest exact', () => {
    const exact = line('abc', { x: 100 });
    const odd = line('XYZ', { x: 200 });
    const page = pageOf('abc def', [itemFor('abc', exact, 0), { ...itemFor('def', odd, 4), transform: [SIZE, 0, 0, SIZE, 200, 700] }]);
    const withGlyphs = matchBoxes(page, { start: 0, end: 7 }, geometry, undefined, 'cover', [...exact, ...odd]);
    const estimated = matchBoxes(page, { start: 0, end: 7 }, geometry);
    expect(withGlyphs).toHaveLength(1);
    // The right edge is the estimated item's, so it matches the estimate there.
    expect(withGlyphs[0].left + withGlyphs[0].width).toBeCloseTo(estimated[0].left + estimated[0].width, 5);
  });

  it('is the estimate when no glyphs were read', () => {
    const glyphs = line('abc');
    const page = pageOf('abc', [itemFor('abc', glyphs)]);
    expect(matchBoxes(page, { start: 0, end: 3 }, geometry, undefined, 'cover', null)).toEqual(matchBoxes(page, { start: 0, end: 3 }, geometry));
  });

  it('maps each page once', () => {
    const glyphs = line('abc');
    const page = pageOf('abc', [itemFor('abc', glyphs)]);
    expect(pageGlyphMap(page, glyphs)).toBe(pageGlyphMap(page, glyphs));
  });
});
