import { describe, expect, it } from 'vitest';
import { createPageGeometry, composeAffineTransforms, type PageGeometry } from '../../geometry/coords.ts';
import { planTextLayer, groupRuns, textLayerReadsBack, type PercentBox, type TextLayerPlan } from './textLayer.ts';
import type { PageGlyph } from './pageGlyphs.ts';

const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 } });

/**
 * A line of glyphs at `y` (PDF baseline), font size 10, each `widthEm` wide
 * (default 0.5), spaced by their own advance. `dir` lets a caller lay the pen
 * out backwards; the fixtures for "keeps content order" instead give Hebrew
 * characters in the same left-to-right pen order real PDF producers write,
 * because a PDF's content stream advances the pen in the order the glyphs are
 * drawn, not the order they read in - which is exactly what `groupRuns` and
 * `planTextLayer` must not reorder.
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

describe('planTextLayer', () => {
  it('drops exactly the middle word of "aaa bbb ccc" and keeps the other two', () => {
    const glyphs = makeLine('aaa bbb ccc');
    // Covers the three "b" cores (x 20..35) without reaching either neighbour's core.
    const plan = planTextLayer(glyphs, geometry, [box(18, 37, 390, 405)]);
    expect(plan.kept).toBe(2);
    expect(plan.dropped).toBe(1);
    expect(plan.runs).toHaveLength(1);
  });

  it('writes the kept words with no space glyph adjacent to the gap at either end', () => {
    const glyphs = makeLine('aaa bbb ccc');
    const plan = planTextLayer(glyphs, geometry, [box(18, 37, 390, 405)]);
    const [run] = plan.runs;
    // Read as text this is "aaa ccc" (one literal space survives - it directly
    // follows the kept "aaa" - but none follows the dropped "bbb"), while the
    // x positions leave a wide gap where the dropped word was.
    expect(run.text).toBe('aaa ccc');
    expect(run.glyphs.map((g) => g.unicode)).toEqual(['a', 'a', 'a', ' ', 'c', 'c', 'c']);
    const lastKeptA = run.glyphs[2];
    const space = run.glyphs[3];
    const firstC = run.glyphs[4];
    expect(space.x).toBeCloseTo(lastKeptA.x + lastKeptA.width);
    // The jump from the space straight to "ccc" is far wider than one glyph's
    // advance: nothing was written for the dropped "bbb" or the space after it.
    expect(firstC.x - (space.x + space.width)).toBeGreaterThan(space.width);
  });

  it('keeps a word a box only grazes above its core (within 0.2em of the top)', () => {
    const glyphs = makeLine('aaa bbb ccc');
    // Viewport y 389..392 sits just above the core's top edge (393): a graze,
    // never reaching in.
    const plan = planTextLayer(glyphs, geometry, [box(20, 35, 389, 392)]);
    expect(plan.kept).toBe(3);
    expect(plan.dropped).toBe(0);
  });

  it('keeps a word a box only reaches into a glyph\'s side bearing', () => {
    const glyphs = makeLine('aaa bbb ccc');
    // The middle "b" (pen x 25) has its core inset to x 26.5..28.5; this box
    // stops at 26.4, inside the left side bearing only.
    const plan = planTextLayer(glyphs, geometry, [box(24, 26.4, 393, 401.5)]);
    expect(plan.kept).toBe(3);
    expect(plan.dropped).toBe(0);
  });

  it('drops the whole word, never single letters, when a box reaches one glyph\'s core', () => {
    const glyphs = makeLine('aaa bbb ccc');
    // Touches only the first "b"'s core (21.5..23.5).
    const plan = planTextLayer(glyphs, geometry, [box(22, 23, 393, 401.5)]);
    expect(plan.kept).toBe(2);
    expect(plan.dropped).toBe(1);
    const [run] = plan.runs;
    expect(run.text).not.toContain('b');
    expect(run.glyphs.some((g) => g.unicode === 'b')).toBe(false);
  });

  it('gives glyph x positions in exact ems from the run\'s first glyph', () => {
    const glyphs = makeLine('aaa', { widthEm: 0.5 });
    const plan = planTextLayer(glyphs, geometry, []);
    const [run] = plan.runs;
    expect(run.glyphs.map((g) => g.x)).toEqual([0, 0.5, 1]);
  });

  it('keeps a right-to-left line in its own content order', () => {
    // Content order as a real RTL PDF producer writes it: the pen still
    // advances left to right, but the characters are the visual (reversed)
    // reading order, e.g. this is "שלום עולם" written backwards.
    const glyphs = makeLine('מולש םלוע');
    const plan = planTextLayer(glyphs, geometry, []);
    expect(plan.runs).toHaveLength(1);
    expect(plan.runs[0].text).toBe('מולש םלוע');
  });

  it('drops nothing on the lower of two lines 11.5pt apart from a box tight around a word on the upper line', () => {
    const size = 11;
    const lowerY = 400;
    const upperY = lowerY + 11.5;
    const lower = makeLine('lower', { y: lowerY, size });
    const upper = makeLine('upper', { y: upperY, size });
    const glyphs = [...upper, ...lower];

    // Descender to ascender + 1pt, around the first glyph of the upper word.
    const CORE_BOTTOM_EM = -0.15;
    const CORE_TOP_EM = 0.7;
    const g = upper[0];
    const viewportYAtDescender = -size * CORE_BOTTOM_EM + (geometry.height - upperY);
    const viewportYAtAscenderPlus1 = -size * CORE_TOP_EM + (geometry.height - upperY) - 1;
    const tightBox = box(g.matrix[4] - 1, g.matrix[4] + size * 0.5 + 1, viewportYAtAscenderPlus1, viewportYAtDescender);

    const plan = planTextLayer(glyphs, geometry, [tightBox]);
    const lowerRun = plan.runs.find((run) => run.text === 'lower');
    expect(lowerRun).toBeDefined();
    expect(plan.runs.some((run) => run.text.includes('upper'))).toBe(false);
  });
});

describe('groupRuns', () => {
  // size 1 so a glyph's PDF-space x/y equal its em-space coordinates directly,
  // keeping the fixtures legible.
  const g = (unicode: string, x: number, y = 0, size = 1, width = 0.5, isSpace = false): PageGlyph => ({
    unicode,
    isSpace,
    matrix: [size, 0, 0, size, x, y],
    width,
  });

  it('breaks a run at a jump backwards past the tolerance', () => {
    const runs = groupRuns([g('a', 0), g('b', -1)]);
    expect(runs.map((r) => r.map((glyph) => glyph.unicode))).toEqual([['a'], ['b']]);
  });

  it('does not break for a small backward move within tolerance', () => {
    const runs = groupRuns([g('a', 0), g('b', 0.45)]);
    expect(runs.map((r) => r.map((glyph) => glyph.unicode))).toEqual([['a', 'b']]);
  });

  it('breaks a run at a baseline change', () => {
    const runs = groupRuns([g('a', 0), g('b', 0.5, 0.3)]);
    expect(runs.map((r) => r.map((glyph) => glyph.unicode))).toEqual([['a'], ['b']]);
  });

  it('does not break for a baseline move within tolerance', () => {
    const runs = groupRuns([g('a', 0), g('b', 0.5, 0.15)]);
    expect(runs.map((r) => r.map((glyph) => glyph.unicode))).toEqual([['a', 'b']]);
  });

  it('breaks a run at a size change', () => {
    const runs = groupRuns([g('a', 0, 0, 1), g('b', 0.5, 0, 1.02)]);
    expect(runs.map((r) => r.map((glyph) => glyph.unicode))).toEqual([['a'], ['b']]);
  });

  it('breaks a run at a gap over 0.25em', () => {
    const runs = groupRuns([g('a', 0), g('b', 0.76)]);
    expect(runs.map((r) => r.map((glyph) => glyph.unicode))).toEqual([['a'], ['b']]);
  });

  it('does not break for a gap within 0.25em', () => {
    const runs = groupRuns([g('a', 0), g('b', 0.74)]);
    expect(runs.map((r) => r.map((glyph) => glyph.unicode))).toEqual([['a', 'b']]);
  });
});

describe('textLayerReadsBack', () => {
  /**
   * Rebuilds `PageGlyph`s from a plan's own runs, as if they had been written
   * to the file and read back: each `LayerGlyph.x` is an em offset from the
   * run's first glyph through `run.matrix` (em space -> viewport), so this
   * undoes exactly that to recover a PDF-space glyph matrix.
   */
  function glyphsFromPlan(plan: TextLayerPlan, geo: PageGeometry): PageGlyph[] {
    const out: PageGlyph[] = [];
    for (const run of plan.runs) {
      for (const layerGlyph of run.glyphs) {
        const local: [number, number, number, number, number, number] = [1, 0, 0, 1, layerGlyph.x, 0];
        const viewportMatrix = composeAffineTransforms(run.matrix, local);
        const pdfMatrix = composeAffineTransforms(geo.viewportToPdf, viewportMatrix);
        out.push({
          unicode: layerGlyph.unicode,
          isSpace: /^\s$/.test(layerGlyph.unicode),
          matrix: pdfMatrix,
          width: layerGlyph.width,
        });
      }
    }
    return out;
  }

  it('is true for the plan\'s own glyphs read back', () => {
    const glyphs = makeLine('aaa bbb ccc');
    const boxes = [box(22, 23, 393, 401.5)];
    const plan = planTextLayer(glyphs, geometry, boxes);
    const readBack = glyphsFromPlan(plan, geometry);
    expect(textLayerReadsBack(plan, readBack, geometry, boxes)).toBe(true);
  });

  it('is false when a glyph under a box is added', () => {
    const glyphs = makeLine('aaa bbb ccc');
    const boxes = [box(22, 23, 393, 401.5)];
    const plan = planTextLayer(glyphs, geometry, boxes);
    const readBack = glyphsFromPlan(plan, geometry);
    // glyphs[4] is the first "b", dropped by the box; adding it back in is
    // exactly the failure the check exists to catch.
    expect(textLayerReadsBack(plan, [...readBack, glyphs[4]], geometry, boxes)).toBe(false);
  });

  it('is false when a kept word is missing', () => {
    const glyphs = makeLine('aaa bbb ccc');
    const boxes = [box(22, 23, 393, 401.5)];
    const plan = planTextLayer(glyphs, geometry, boxes);
    const readBack = glyphsFromPlan(plan, geometry);
    // Drop the whole written "aaa" word (its three glyphs), leaving only "ccc".
    expect(textLayerReadsBack(plan, readBack.slice(3), geometry, boxes)).toBe(false);
  });

  it('is false when an extra word appears', () => {
    const glyphs = makeLine('aaa bbb ccc');
    const boxes = [box(22, 23, 393, 401.5)];
    const plan = planTextLayer(glyphs, geometry, boxes);
    const readBack = glyphsFromPlan(plan, geometry);
    const extra: PageGlyph = { unicode: 'z', isSpace: false, matrix: [10, 0, 0, 10, 100, 400], width: 0.5 };
    expect(textLayerReadsBack(plan, [...readBack, extra], geometry, boxes)).toBe(false);
  });
});
