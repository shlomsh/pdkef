// READ-13: the pencil outline as SVG path data. rough.js's generator (not its DOM renderer) draws the double line, so
// the same strokes and seed give the same path whenever a mark opens.
import { RoughGenerator } from 'roughjs/bin/generator';
import type { OutlineStroke } from './markOutline.ts';

const generator = new RoughGenerator();

/** The sketched `strokes` as one path `d`, a subpath per pencil pass, straying with `wobble` (points). One path, so one seed runs through them all. */
export function outlinePath(strokes: readonly OutlineStroke[], seed: number, wobble: number): string {
  const d = strokes.map(([a, b]) => `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`).join('');
  const drawable = generator.path(d, { roughness: 1.15, bowing: 1.1, strokeWidth: 1.2, seed, preserveVertices: false, maxRandomnessOffset: wobble });
  return generator.toPaths(drawable).map((p) => p.d).join(' ');
}
