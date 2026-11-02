// READ-13: the pencil outline as SVG path data. rough.js's generator (not its DOM renderer) draws the double line, so
// the same vertices and seed give the same path whenever a mark opens.
import { RoughGenerator } from 'roughjs/bin/generator';
import type { OutlinePt } from './markOutline.ts';

const generator = new RoughGenerator();

/** The sketched polygon through `vertices` as one path `d`, a subpath per pencil pass. */
export function outlinePath(vertices: readonly OutlinePt[], seed: number): string {
  const drawable = generator.polygon(vertices.map(([x, y]): [number, number] => [x, y]), {
    roughness: 1.15, bowing: 1.1, strokeWidth: 1.2, seed, preserveVertices: false,
  });
  return generator.toPaths(drawable).map((p) => p.d).join(' ');
}
