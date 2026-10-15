import { describe, expect, it } from 'vitest';
import { mosaicRuns } from './mosaic.ts';

type Tone = keyof ReturnType<typeof mosaicRuns>;

/** Every run with its tone, in row then column order. */
function flat(cols: number, rows: number) {
  const runs = mosaicRuns(cols, rows);
  const out: { y: number; x: number; w: number; tone: Tone }[] = [];
  for (const tone of Object.keys(runs) as Tone[]) {
    for (const r of runs[tone]) out.push({ ...r, tone });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

function toneAt(cols: number, rows: number, c: number, r: number) {
  return flat(cols, rows).find((s) => s.y === r && c >= s.x && c < s.x + s.w)?.tone;
}

describe('mosaicRuns', () => {
  it.each([
    [32, 24],
    [16, 12],
    [8, 6],
  ])('covers every cell of %ix%i exactly once', (cols, rows) => {
    const seen = new Array(cols * rows).fill(0);
    for (const s of flat(cols, rows)) {
      for (let i = 0; i < s.w; i++) seen[s.y * cols + s.x + i]++;
    }
    expect(seen.every((n) => n === 1)).toBe(true);
  });

  it('never leaves two adjacent runs of one tone in a row', () => {
    const all = flat(32, 24);
    for (let i = 1; i < all.length; i++) {
      const p = all[i - 1];
      const s = all[i];
      if (p.y === s.y && p.x + p.w === s.x) expect(p.tone).not.toBe(s.tone);
    }
  });

  it.each([
    [8, 6],
    [16, 12],
  ])('puts the sun at u=.72, v=.28 for %ix%i', (cols, rows) => {
    expect(toneAt(cols, rows, Math.floor(0.72 * cols), Math.floor(0.28 * rows))).toBe('sun');
  });

  it('paints the bottom-right cell as ground', () => {
    expect(toneAt(8, 6, 7, 5)).toBe('ground');
    expect(toneAt(32, 24, 31, 23)).toBe('ground');
  });
});
