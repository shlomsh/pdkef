import { describe, expect, it } from 'vitest';
import { outlinePath } from './markOutlinePath.ts';
import type { OutlinePt } from './markOutline.ts';
import { strokeSeed } from '#editor/geometry/sketchStroke.ts';

const square: OutlinePt[] = [[37, 96], [343, 96], [343, 118], [37, 118]];

describe('outlinePath', () => {
  it('is non-empty SVG path data', () => {
    const d = outlinePath(square, strokeSeed('mark-1'));
    expect(d.length).toBeGreaterThan(20);
    expect(d.startsWith('M')).toBe(true);
  });
  it('is byte-identical for the same seed and differs for another', () => {
    expect(outlinePath(square, strokeSeed('mark-1'))).toBe(outlinePath(square, strokeSeed('mark-1')));
    expect(outlinePath(square, strokeSeed('mark-1'))).not.toBe(outlinePath(square, strokeSeed('mark-2')));
  });
});
