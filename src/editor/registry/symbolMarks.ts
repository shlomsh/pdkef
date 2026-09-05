import type { SymbolMark } from '../model/editorModel.ts';

/**
 * The geometry of the check, cross and dot marks, in one place.
 *
 * It used to be in two: `SymbolNode.tsx` drew an SVG path and `symbol.ts` drew
 * pdf-lib lines, and the two had drifted. The editor's cross ran 6 to 18 of the
 * design box at stroke 2.5 while the exported one ran 4 to 20 at thickness 3 -
 * so the mark you placed was a third smaller than the mark you downloaded, on
 * a feature whose whole promise is that the download matches the screen.
 *
 * The exporter's numbers are the ones kept, because they are what every
 * already-signed document was drawn with and what the export-render baseline
 * pins. The editor now follows them.
 *
 * Everything is expressed in a 24x24 design box with y measured *downwards*,
 * which is what both an SVG viewBox and the exporter's `pdfY - height * k / 24`
 * already assume.
 */

const DESIGN_BOX = 24;

export interface MarkGeometry {
  /** Polylines to stroke, as `[x, y]` pairs in design units. Empty for a dot. */
  strokes: Array<Array<[number, number]>>;
  /** Stroke thickness in design units. */
  thickness: number;
  /** A filled circle instead of strokes, for the dot. */
  disc?: { cx: number; cy: number; r: number };
}

export const SYMBOL_MARKS: Record<SymbolMark, MarkGeometry> = Object.freeze({
  check: { strokes: [[[4, 12], [9, 17], [20, 6]]], thickness: 3 },
  x: { strokes: [[[4, 4], [20, 20]], [[20, 4], [4, 20]]], thickness: 3 },
  dot: { strokes: [], thickness: 0, disc: { cx: 12, cy: 12, r: 8 } },
});

export function markGeometry(mark: SymbolMark | undefined): MarkGeometry {
  return SYMBOL_MARKS[mark as SymbolMark] || SYMBOL_MARKS.check;
}

export interface InkExtent {
  x0: number; y0: number; x1: number; y1: number;
  width: number; height: number;
  centerX: number; centerY: number;
}

/**
 * What the mark actually covers, in design units - stroke width and round caps
 * included, because a 3-unit round cap really does put ink 1.5 units past the
 * end of the line.
 *
 * This is the difference between sizing a mark by its element box and sizing it
 * by the mark: a cross only inks 19 of its 24 units, so an element box laid
 * exactly over a printed checkbox draws a cross a fifth too small for it. And
 * the check is not centred in its own box - its ink sits half a unit high -
 * which no amount of centring the *box* will fix.
 */
export function markInkExtent(mark: SymbolMark | undefined): InkExtent {
  const geometry = markGeometry(mark);
  if (geometry.disc) {
    const { cx, cy, r } = geometry.disc;
    return {
      x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r,
      width: r * 2, height: r * 2, centerX: cx, centerY: cy,
    };
  }
  const points = geometry.strokes.flat();
  const half = geometry.thickness / 2;
  const x0 = Math.min(...points.map(([x]) => x)) - half;
  const x1 = Math.max(...points.map(([x]) => x)) + half;
  const y0 = Math.min(...points.map(([, y]) => y)) - half;
  const y1 = Math.max(...points.map(([, y]) => y)) + half;
  return {
    x0, y0, x1, y1,
    width: x1 - x0,
    height: y1 - y0,
    centerX: (x0 + x1) / 2,
    centerY: (y0 + y1) / 2,
  };
}

/** An SVG path `d` for the mark's strokes, for the editor's renderer. */
export function markPathData(mark: SymbolMark | undefined): string {
  return markGeometry(mark).strokes
    .map((line) => line
      .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`)
      .join(''))
    .join('');
}

export { DESIGN_BOX };
