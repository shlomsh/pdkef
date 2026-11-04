import { describe, expect, it } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { onEdge } from './framing.ts';

const at = (m: number): Quad => [{ x: m, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: m, y: 0.8 }];

describe('onEdge', () => {
  it('is true for a corner at or within the margin, on any side', () => {
    expect(onEdge(at(0.02), 0.02)).toBe(true);
    expect(onEdge(at(0.01), 0.02)).toBe(true);
    expect(onEdge(at(-0.1), 0.02)).toBe(true);
    expect(onEdge([{ x: 0.2, y: 0.2 }, { x: 0.99, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }], 0.02)).toBe(true);
    expect(onEdge([{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 1 }, { x: 0.2, y: 0.8 }], 0.02)).toBe(true);
  });
  it('is false for a page clear of the margin', () => {
    expect(onEdge(at(0.03), 0.02)).toBe(false);
  });
});
