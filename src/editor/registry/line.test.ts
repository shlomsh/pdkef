import { describe, expect, it } from 'vitest';
import { applyLineResize } from './line.ts';

describe('applyLineResize', () => {
  const start = { x1: 10, y1: 20, x2: 60, y2: 80 };

  it('moves only the selected endpoint', () => {
    expect(applyLineResize({ handle: 'line-start', delta: { x: 5, y: -4 }, start }))
      .toEqual({ x1: 15, y1: 16 });
    expect(applyLineResize({ handle: 'line-end', delta: { x: -3, y: 2 }, start }))
      .toEqual({ x2: 57, y2: 82 });
  });
});
