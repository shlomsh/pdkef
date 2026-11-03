import { describe, expect, it } from 'vitest';
import { focusMeasure, quadArea, sharpness } from './sharpness.ts';
import { addNoise, solid } from '../edges/testImages.ts';
import type { GrayImage, Quad } from '../quad.ts';

function checker(size: number, cell: number): GrayImage {
  const img = solid(size, size, 0);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) img.data[y * size + x] = ((x / cell | 0) + (y / cell | 0)) % 2 ? 255 : 0;
  return img;
}

function blur(img: GrayImage): GrayImage {
  const out = { ...img, data: new Uint8ClampedArray(img.data) };
  for (let y = 1; y < img.height - 1; y += 1) for (let x = 1; x < img.width - 1; x += 1) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) s += img.data[(y + dy) * img.width + x + dx];
    out.data[y * img.width + x] = s / 9;
  }
  return out;
}

describe('sharpness', () => {
  it('is zero on a flat image', () => {
    expect(sharpness(solid(64, 64, 120))).toBe(0);
  });

  it('is higher for a sharp image than for the same image blurred', () => {
    const sharp = checker(64, 4);
    expect(sharpness(sharp)).toBeGreaterThan(4 * sharpness(blur(blur(sharp))));
  });

  it('only counts pixels inside the quad', () => {
    const img = solid(100, 100, 128);
    const textured = solid(100, 100, 128);
    addNoise(textured, 100, 7);
    // Texture only in the left half; a quad over the flat right half sees none of it.
    for (let y = 0; y < 100; y += 1) for (let x = 50; x < 100; x += 1) textured.data[y * 100 + x] = 128;
    const right: Quad = [{ x: 0.55, y: 0.1 }, { x: 0.95, y: 0.1 }, { x: 0.95, y: 0.9 }, { x: 0.55, y: 0.9 }];
    const left: Quad = [{ x: 0.05, y: 0.1 }, { x: 0.45, y: 0.1 }, { x: 0.45, y: 0.9 }, { x: 0.05, y: 0.9 }];
    expect(sharpness(textured, right)).toBe(0);
    expect(sharpness(textured, left)).toBeGreaterThan(0);
    expect(sharpness(img, left)).toBe(0);
  });

  it('treats a null quad as the whole image', () => {
    const img = checker(32, 2);
    expect(sharpness(img, null)).toBe(sharpness(img));
  });
});

describe('quadArea', () => {
  it('is 1 for the full frame and 0.25 for a centred half-size square', () => {
    expect(quadArea([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBeCloseTo(1);
    expect(quadArea([{ x: 0.25, y: 0.25 }, { x: 0.75, y: 0.25 }, { x: 0.75, y: 0.75 }, { x: 0.25, y: 0.75 }])).toBeCloseTo(0.25);
  });

  it('does not depend on winding', () => {
    expect(quadArea([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }])).toBeCloseTo(1);
  });
});

describe('focusMeasure', () => {
  const text = (): GrayImage => {
    const img = solid(256, 256, 230);
    // dark strokes, 3px wide every 8px, like small print
    for (let y = 0; y < 256; y += 1) for (let x = 0; x < 256; x += 1) if (x % 8 < 3 && (y >> 4) % 2 === 0) img.data[y * 256 + x] = 30;
    return img;
  };
  const noiseOnly = (): GrayImage => { const i = solid(256, 256, 120); addNoise(i, 12, 3); return i; };
  const noisyText = (blurs: number): GrayImage => {
    let i = text();
    for (let k = 0; k < blurs; k += 1) i = blur(i);
    addNoise(i, 12, 3);
    return i;
  };

  it('scores noise alone well under the same noise over sharp text', () => {
    expect(focusMeasure(noiseOnly())).toBeLessThan(focusMeasure(noisyText(0)) / 4);
  });

  it('scores blurred text under sharp text at the same noise', () => {
    expect(focusMeasure(noisyText(3))).toBeLessThan(focusMeasure(noisyText(0)) / 2);
  });

  it('is zero on a flat patch and on one too small to bin', () => {
    expect(focusMeasure(solid(64, 64, 100))).toBe(0);
    expect(focusMeasure(solid(4, 4, 100))).toBe(0);
  });
});
