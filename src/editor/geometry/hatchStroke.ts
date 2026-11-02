// READ-14: the Pencil mark as pen strokes. rough.js's generator (not its DOM renderer) hatches each line's band; the
// strokes are M and C ops, the shape SVG paths and PDF content streams both draw, so screen, print and the export agree.
// Loaded with import() only (hatchLoader.ts in the Highlight tool, serializeHighlight for the PDF): rough.js stays out of the first paint.
import { RoughGenerator } from 'roughjs/bin/generator';
import type { PathOp, SketchRect } from './sketchStroke.ts';
import { HATCH_GAP, HATCH_WEIGHT } from './hatchInk.ts';

/** rough.js's `hachureAngle`: the strokes climb to the right, 49 degrees from the horizontal in y-down space. */
const HATCH_ANGLE = -41;

/** Measured over 60 seeds: 0.6 wobbles strokes about 2pt past a line's band, 1 about 4pt, which reaches the next line. */
const HATCH_ROUGHNESS = 0.6;
/** Strokes this short or shorter are dropped. */
const MIN_STROKE = 1;

const generator = new RoughGenerator();

/** The hatch strokes of every band: each band draws from its own seed so two lines never repeat one another. */
export function hatchOps(rects: readonly SketchRect[], seed: number): PathOp[] {
  return rects.flatMap((r, i) => {
    const drawable = generator.rectangle(r.x, r.y, r.w, r.h, {
      seed: (seed + i * 7919) >>> 0, roughness: HATCH_ROUGHNESS, stroke: 'none', fill: '#000', fillStyle: 'hachure',
      hachureAngle: HATCH_ANGLE, hachureGap: HATCH_GAP, fillWeight: HATCH_WEIGHT,
    });
    const ops = drawable.sets.filter((set) => set.type === 'fillSketch').flatMap((set) => set.ops);
    // Each stroke is a move and a curve; a corner the hatch only touches comes out as a point, which draws as a speck.
    const strokes: PathOp[] = [];
    for (let k = 0; k + 1 < ops.length; k += 2) {
      const [m, c] = [ops[k], ops[k + 1]];
      if (m.op !== 'move' || c.op !== 'bcurveTo' || Math.hypot(c.data[4] - m.data[0], c.data[5] - m.data[1]) <= MIN_STROKE) continue;
      strokes.push(['M', m.data[0], m.data[1]], ['C', c.data[0], c.data[1], c.data[2], c.data[3], c.data[4], c.data[5]]);
    }
    return strokes;
  });
}
