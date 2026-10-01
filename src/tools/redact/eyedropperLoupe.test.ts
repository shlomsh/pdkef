import { describe, expect, it } from 'vitest';
import { LOUPE_SIZE, TOUCH_LIFT, canvasPixelAt, loupePlacement, loupeSource } from './eyedropperLoupe.ts';

describe('canvasPixelAt', () => {
  const rect = { left: 10, top: 20, width: 100, height: 200 };
  it('maps a client point to a canvas pixel', () => {
    expect(canvasPixelAt(rect, 200, 400, 60, 120)).toEqual({ x: 100, y: 200 });
  });
  it('clamps to the canvas', () => {
    expect(canvasPixelAt(rect, 200, 400, -50, -50)).toEqual({ x: 0, y: 0 });
    expect(canvasPixelAt(rect, 200, 400, 999, 999)).toEqual({ x: 199, y: 399 });
  });
});

describe('loupeSource', () => {
  it('takes the full square in the middle', () => {
    expect(loupeSource(50, 60, 15, 200, 400)).toEqual({ sx: 43, sy: 53, sw: 15, sh: 15, dx: 0, dy: 0 });
  });
  it('clips at each edge and offsets so the centre stays centred', () => {
    expect(loupeSource(2, 60, 15, 200, 400)).toEqual({ sx: 0, sy: 53, sw: 10, sh: 15, dx: 5, dy: 0 });
    expect(loupeSource(198, 60, 15, 200, 400)).toEqual({ sx: 191, sy: 53, sw: 9, sh: 15, dx: 0, dy: 0 });
    expect(loupeSource(50, 1, 15, 200, 400)).toEqual({ sx: 43, sy: 0, sw: 15, sh: 9, dx: 0, dy: 6 });
    expect(loupeSource(50, 399, 15, 200, 400)).toEqual({ sx: 43, sy: 392, sw: 15, sh: 8, dx: 0, dy: 0 });
  });
  it('clips a corner on both axes', () => {
    expect(loupeSource(0, 0, 15, 200, 400)).toEqual({ sx: 0, sy: 0, sw: 8, sh: 8, dx: 7, dy: 7 });
  });
});

describe('loupePlacement', () => {
  it('centres a mouse loupe on the pointer', () => {
    expect(loupePlacement(300, 200, 800, 600, LOUPE_SIZE, false)).toEqual({ left: 240, top: 140 });
  });
  it('lifts a touch loupe above the finger', () => {
    expect(loupePlacement(300, 400, 800, 600, LOUPE_SIZE, true)).toEqual({ left: 240, top: 400 - TOUCH_LIFT - LOUPE_SIZE });
  });
  it('flips below the finger near the top', () => {
    expect(loupePlacement(300, 50, 800, 600, LOUPE_SIZE, true)).toEqual({ left: 240, top: 50 + TOUCH_LIFT });
  });
  it('stays inside the viewport horizontally', () => {
    expect(loupePlacement(5, 400, 400, 600, LOUPE_SIZE, true).left).toBe(8);
    expect(loupePlacement(395, 400, 400, 600, LOUPE_SIZE, true).left).toBe(400 - LOUPE_SIZE - 8);
  });
});
