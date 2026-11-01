import { describe, expect, it } from 'vitest';
import { pinBox } from './pinBox.ts';

describe('pinBox', () => {
  it('is a 2.4% wide square centered on the point, kept on the page', () => {
    const box = pinBox({ x: 50, y: 50 }, { width: 200, height: 100 });
    expect(box.width).toBe(2.4);
    expect(box.height).toBeCloseTo(4.8);
    expect(box.left).toBeCloseTo(48.8);
    expect(box.top).toBeCloseTo(47.6);
    expect(pinBox({ x: 0, y: 100 }, { width: 200, height: 100 })).toMatchObject({ left: 0, top: 100 - box.height });
  });
});
