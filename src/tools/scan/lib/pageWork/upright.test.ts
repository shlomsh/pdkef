import { describe, expect, it } from 'vitest';
import { seededRandom } from '#lib/pageEnhance/seededRandom.test-helper.ts';
import { rotateQuad, type RgbaImage } from '#lib/pageEnhance/quad.ts';
import { FULL_QUAD } from '../quad.ts';
import { uprightTurns } from './upright.ts';

const W = 800;
const H = 1040;

/** A page of `rows` text rows across (letters drawn as outlines, words apart, ragged ends), turned
 * `quarters` clockwise. `weight`: the letters carry a stroke across their top, as printed letters carry
 * their ink; without it a row reads the same both ways up. */
function page(rows: number, quarters: number, weight = true): RgbaImage {
  const ink = new Uint8Array(W * H);
  const rnd = seededRandom(7);
  const pitch = rows > 1 ? 0.76 / (rows - 1) : 0;
  for (let r = 0; r < rows; r += 1) {
    const base = Math.round((0.12 + r * pitch) * H);
    const end = 0.9 - rnd() * 0.2;
    let x = 0.1 * W;
    while (x < end * W) {
      const letters = 2 + Math.floor(rnd() * 8);
      for (let k = 0; k < letters && x < end * W; k += 1) {
        const lw = Math.round(W * (0.005 + rnd() * 0.005));
        const top = base - Math.round(H * (rnd() < 0.3 ? 0.016 : 0.011));
        for (let y = top; y < base; y += 1) {
          for (let px = Math.round(x); px < Math.round(x) + lw; px += 1) {
            const edge = px - Math.round(x) < 2 || Math.round(x) + lw - px <= 2 || (weight && y - top < 2);
            if (edge) ink[y * W + px] = 1;
          }
        }
        x += lw + 2;
      }
      x += W * (0.01 + rnd() * 0.01);
    }
  }
  const [w, h] = quarters % 2 ? [H, W] : [W, H];
  const data = new Uint8ClampedArray(w * h * 4);
  const from = [
    (x: number, y: number) => y * W + x,
    (x: number, y: number) => (H - 1 - x) * W + y,
    (x: number, y: number) => (H - 1 - y) * W + (W - 1 - x),
    (x: number, y: number) => x * W + (W - 1 - y),
  ][quarters];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = ink[from(x, y)] ? 30 : 220;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

describe('uprightTurns', () => {
  it('stands a page up whichever way it lies', () => {
    expect(uprightTurns(page(18, 0), FULL_QUAD)).toBe(0);
    expect(uprightTurns(page(18, 1), FULL_QUAD)).toBe(3);
    expect(uprightTurns(page(18, 2), FULL_QUAD)).toBe(2);
    expect(uprightTurns(page(18, 3), FULL_QUAD)).toBe(1);
    // rotateQuad's own turn: one turn clockwise puts the photo's bottom-left at the page's top-left
    expect(rotateQuad(FULL_QUAD, 1)[0]).toEqual(FULL_QUAD[3]);
  });

  it('gives a sideways page the one clockwise turn when its text does not say which way is up', () => {
    expect(uprightTurns(page(18, 1, false), FULL_QUAD)).toBe(1);
    expect(uprightTurns(page(18, 3, false), FULL_QUAD)).toBe(1);
  });

  it('leaves an upright-shaped page alone when its text does not say which way is up', () => {
    expect(uprightTurns(page(18, 2, false), FULL_QUAD)).toBe(0);
  });

  it('leaves a page with too little text alone', () => {
    expect(uprightTurns(page(2, 1), FULL_QUAD)).toBe(0);
    expect(uprightTurns(page(2, 2), FULL_QUAD)).toBe(0);
  });

  it('leaves the page unturned when the corners define no page', () => {
    const line = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.9 }, { x: 0.9, y: 0.9 }] as typeof FULL_QUAD;
    expect(uprightTurns(page(18, 1), line)).toBe(0);
  });
});
