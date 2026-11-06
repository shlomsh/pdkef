import { describe, expect, it } from 'vitest';
import { outlinePath } from './markOutlinePath.ts';
import { outlineStrokes, outlineWobble, type OutlineStroke } from './markOutline.ts';
import { strokeSeed, type SketchRect } from '#editor/geometry/sketchStroke.ts';

type OutlinePt = OutlineStroke[number];

const square: OutlineStroke[] = [[[37, 96], [343, 96]], [[343, 96], [343, 118]], [[343, 118], [37, 118]], [[37, 118], [37, 96]]];

/** Points along the path's curves: the pencil as it is drawn. */
function pencilPoints(d: string): OutlinePt[] {
  const pts: OutlinePt[] = [];
  for (const sub of d.split('M').slice(1)) {
    const n = (sub.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    for (let i = 0; i + 7 < n.length; i += 6) {
      for (let t = 0; t <= 1; t += 1 / 16) {
        const u = 1 - t, at = (k: number) => u * u * u * n[i + k] + 3 * u * u * t * n[i + 2 + k] + 3 * u * t * t * n[i + 4 + k] + t * t * t * n[i + 6 + k];
        pts.push([at(0), at(1)]);
      }
    }
  }
  return pts;
}

// READ-26: the sample paper, measured in the browser. 9 pt type on 12.5 pt leading: two lines' bands, 11.82 pt tall, their
// own ink 1.35 pt inside the band, and the next line's ink 2.07 pt past the foot. A word gap on it is 2.25 pt.
const LEADING = 12.5, BAND = 11.82, INK_PAD = 1.35, WHITE = 2.07, WORD_GAP = 2.25;
const passage = (width: number): SketchRect[] => [{ x: 72 + 28, y: 265, w: width - 28, h: BAND }, { x: 72, y: 265 + LEADING, w: width - 40, h: BAND }];

describe('outlinePath', () => {
  it('is non-empty SVG path data', () => {
    const d = outlinePath(square, strokeSeed('mark-1'), 1);
    expect(d.length).toBeGreaterThan(20);
    expect(d.startsWith('M')).toBe(true);
  });
  it('is byte-identical for the same seed and differs for another', () => {
    expect(outlinePath(square, strokeSeed('mark-1'), 1)).toBe(outlinePath(square, strokeSeed('mark-1'), 1));
    expect(outlinePath(square, strokeSeed('mark-1'), 1)).not.toBe(outlinePath(square, strokeSeed('mark-2'), 1));
  });
  it('READ-26: on tight text the pencil stays in the white between the lines, across seeds and line lengths', () => {
    for (const width of [60, 120, 200, 260, 460]) {
      const bands = passage(width), head = bands[0].y, foot = bands[1].y + BAND;
      for (let seed = 1; seed <= 300; seed++) {
        const ys = pencilPoints(outlinePath(outlineStrokes(bands), seed, outlineWobble(bands))).map((p) => p[1]);
        expect(Math.max(...ys) - foot).toBeLessThan(WHITE);
        expect(head - Math.min(...ys)).toBeLessThan(WHITE);
      }
    }
  });
  it('READ-26: beside the ink of its own line the pencil stays in the word gap', () => {
    const word: SketchRect[] = [{ x: 200, y: 265, w: 40, h: BAND }];
    const inLine = ([, y]: OutlinePt) => y > 265 + INK_PAD && y < 265 + BAND - INK_PAD;
    for (let seed = 1; seed <= 300; seed++) {
      const xs = pencilPoints(outlinePath(outlineStrokes(word), seed, outlineWobble(word))).filter(inLine).map((p) => p[0]);
      expect(Math.max(...xs) - 240).toBeLessThan(WORD_GAP);
      expect(200 - Math.min(...xs)).toBeLessThan(WORD_GAP);
    }
  });
});
