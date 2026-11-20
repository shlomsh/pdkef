import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { corpus } from './corpus.ts';
import { guessCorners } from './index.ts';
import { parsePgm } from './real/pgm.ts';
import { repairGuess } from './repair.ts';
import { addNoise, fillRect, norm, solid } from './testImages.ts';

const W = 600;
const H = 800;
const toUnit = (q: Quad): Quad => q.map((p) => norm(p, W, H)) as Quad;
const TRUE = toUnit([{ x: 60, y: 48 }, { x: 540, y: 48 }, { x: 540, y: 740 }, { x: 60, y: 740 }]);

// A light page on a darker table with blank margins and lines of text down it.
function page() {
  const image = solid(W, H, 120);
  fillRect(image, 60, 48, 480, 692, 200);
  for (let y = 120; y < 700; y += 28) fillRect(image, 120, y, 360, 6, 60);
  addNoise(image, 3, 5);
  return image;
}

describe('repairGuess', () => {
  // Protects the easy case: a page-shaped guess is not touched (same reference), so following cannot make it worse.
  it('returns a page-shaped guess on a clear page as the same reference', () => {
    const guess = TRUE.map((p, i) => ({ x: p.x + (i % 2 ? -0.01 : 0.01), y: p.y + 0.008 })) as Quad;
    expect(repairGuess(guess, page())).toBe(guess);
  });

  // Protects the repair: a guess with one corner dragged far off is slid back onto the paper's corners.
  it('repairs a guess with one corner pulled far off a clear page', () => {
    const guess = TRUE.map((p, i) => (i === 2 ? { x: p.x + 0.12, y: p.y - 0.15 } : p)) as Quad;
    const got = repairGuess(guess, page());
    expect(got).not.toBe(guess);
    got.forEach((p, i) => {
      expect(Math.abs(p.x - TRUE[i].x)).toBeLessThan(0.02);
      expect(Math.abs(p.y - TRUE[i].y)).toBeLessThan(0.02);
    });
  });

  // Protects the guard for the easy case: on every labelled scene the first guess is already page-shaped and is left alone.
  it('leaves the guess of every corpus and real fixture untouched', () => {
    const dir = new URL('./real/', import.meta.url);
    const real = ['blank-form-on-white-table', 'envelope-on-lap'].map((n) => parsePgm(new Uint8Array(readFileSync(new URL(`${n}.pgm`, dir)))));
    const changed: number[] = [];
    [...corpus.map((c) => c.image), ...real].forEach((image, i) => {
      const guess = guessCorners(image);
      if (guess && repairGuess(guess, image) !== guess) changed.push(i);
    });
    expect(changed).toEqual([]);
  }, 60_000);
});
