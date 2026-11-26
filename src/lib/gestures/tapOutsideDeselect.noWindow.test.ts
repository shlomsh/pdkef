// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readTapSample } from './tapOutsideDeselect.ts';

describe('readTapSample', () => {
  const touch = { clientX: 12, clientY: 34 } as Touch;

  it('defaults to scale 1 when window is undefined', () => {
    // Live control: under Node there really is no window.
    expect(typeof window).toBe('undefined');
    expect(readTapSample(touch, 1, 0, undefined).viewportScale).toBe(1);
  });
});
