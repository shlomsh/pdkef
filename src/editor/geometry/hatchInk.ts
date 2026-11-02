// READ-14: what a Pencil mark's strokes look like, shared by the screen, print and the PDF. The strokes themselves come
// from markHatchPath.ts, which is loaded with import(); these few numbers are not, so every surface can read them.
import { strokeSeed, svgPath, type SketchRect } from './sketchStroke.ts';
import type { hatchOps } from './hatchStroke.ts';

/** Between strokes (rough.js's own measure, about 3 pt across the band) and the stroke weight, in points at 100%. */
export const HATCH_GAP = 3.4;
export const HATCH_WEIGHT = 1.6;

/** A Pencil mark's strokes as one SVG path `d`, from the bands in points and the mark's id. */
export function hatchPathD(hatch: typeof hatchOps, rects: readonly SketchRect[], id: string): string {
  return svgPath(hatch(rects, strokeSeed(id)));
}

/** The attributes of the one `<path>` that draws a Pencil mark, so the screen, the live swipe and print agree. */
export function hatchInkAttrs(color: string) {
  return { fill: 'none', stroke: color, 'stroke-width': String(HATCH_WEIGHT), 'stroke-linecap': 'round' } as const;
}
