import { describe, expect, it } from 'vitest';
import { createPageGeometry } from '../../geometry/coords.ts';
import { previewTexts, type PreviewObject } from './deletePreviews.ts';
import type { PageGlyph } from './pageGlyphs.ts';

const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 } });

/** A line of glyphs on baseline `y`, size 10, each 0.5 em wide, pen moving by `dir`. */
function line(chars: string, { x = 0, y = 400, dir = 1 }: { x?: number; y?: number; dir?: number } = {}): PageGlyph[] {
  let pen = x;
  const glyphs: PageGlyph[] = [];
  for (const ch of chars) {
    glyphs.push({ unicode: ch, isSpace: ch === ' ', matrix: [10, 0, 0, 10, pen, y], width: 0.5 });
    pen += 5 * dir;
  }
  return glyphs;
}

/** A text object whose box is the PDF-space rectangle x0..x1, y0..y1. */
const text = (id: string, x0: number, x1: number, y0 = 395, y1 = 410): PreviewObject => ({
  id, kind: 'text', bbox: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
});

describe('previewTexts', () => {
  it('reads Latin text left to right', () => {
    expect(previewTexts([text('a', 0, 55)], line('Hello world'), geometry).get('a')).toBe('Hello world');
  });

  it('reads a Hebrew run stored in visual order in reading order', () => {
    // Pen moves right, characters already in visual order, as a PDF stores them.
    const glyphs = line('םולש םלוע');
    expect(previewTexts([text('a', 0, 45)], glyphs, geometry).get('a')).toBe('עולם שלום');
  });

  it('reads a Hebrew run stored in logical order in the same reading order', () => {
    const glyphs = line('עולם שלום', { x: 40, dir: -1 });
    expect(previewTexts([text('a', 0, 45)], glyphs, geometry).get('a')).toBe('עולם שלום');
  });

  it('keeps a number inside Hebrew text readable', () => {
    // "דף 12 מתוך 34" laid out right to left: visual order left to right.
    const glyphs = line('34 ךותמ 12 ףד');
    expect(previewTexts([text('a', 0, 65)], glyphs, geometry).get('a')).toBe('דף 12 מתוך 34');
  });

  it('leaves out a glyph that lies outside the object', () => {
    const glyphs = [...line('keep', { x: 0 }), ...line('other', { x: 100 })];
    const previews = previewTexts([text('a', 0, 20), text('b', 100, 125)], glyphs, geometry);
    expect(previews.get('a')).toBe('keep');
    expect(previews.get('b')).toBe('other');
  });

  it('gives each of two lines in one object its words, top line first', () => {
    const glyphs = [...line('second', { y: 380 }), ...line('first', { y: 400 })];
    expect(previewTexts([text('a', 0, 40, 375, 410)], glyphs, geometry).get('a')).toBe('first second');
  });

  it('gives no preview when no glyph lies inside the object', () => {
    expect(previewTexts([text('a', 300, 400)], line('far away'), geometry).has('a')).toBe(false);
    expect(previewTexts([text('a', 0, 55)], [], geometry).has('a')).toBe(false);
  });

  it('gives an image no preview', () => {
    const image: PreviewObject = { id: 'i', kind: 'image', bbox: { x: 0, y: 395, width: 55, height: 15 } };
    expect(previewTexts([image], line('Hello'), geometry).size).toBe(0);
  });

  it('gives the end of a run whose box came out short to that run, and a far glyph to none', () => {
    // Box ends at x = 20, the run is 'abcdefgh' (to x = 40); 'z' sits far away.
    const glyphs = [...line('abcdefgh'), ...line('z', { x: 400 })];
    expect(previewTexts([text('a', 0, 20)], glyphs, geometry).get('a')).toBe('abcdefgh');
  });

  it('gives a glyph no box holds to the nearer of two runs', () => {
    const glyphs = line('aabb'); // a at 0..10, b at 10..20; boxes stop short at 8 and start at 12
    const previews = previewTexts([text('a', 0, 8), text('b', 12, 30)], glyphs, geometry);
    expect(previews.get('a')).toBe('aa');
    expect(previews.get('b')).toBe('bb');
  });
});
