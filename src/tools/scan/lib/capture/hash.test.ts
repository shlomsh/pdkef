import { describe, expect, it } from 'vitest';
import { applyHomography, homography } from '../homography.ts';
import { FULL_QUAD, type GrayImage, type Quad } from '../quad.ts';
import { DEFAULT_CAPTURE_PARAMS } from './types.ts';
import { averageHash, hashDistance } from './hash.ts';

const image = (w: number, h: number, f: (x: number, y: number) => number): GrayImage => {
  const data = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) data[y * w + x] = f(x, y);
  return { width: w, height: h, data };
};
const halves = image(64, 64, (x) => (x < 32 ? 20 : 220));

/** A seeded PRNG, so the synthetic pages are the same every run. */
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

/** A printed page: paragraphs of word-runs on white, and a dark figure block at `figure` (page fractions). */
function textPage(seed: number, figure: { x: number; y: number; w: number; h: number }): GrayImage {
  const W = 360;
  const H = 480;
  const rand = rng(seed);
  const px = new Uint8ClampedArray(W * H).fill(235);
  const fill = (x0: number, y0: number, w: number, h: number, v: number) => {
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y += 1) for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x += 1) px[y * W + x] = v;
  };
  for (let y = 30; y < H - 30; y += 9) {
    if (rand() < 0.12) { y += 9; continue; } // a paragraph break
    const end = rand() < 0.2 ? 30 + rand() * (W - 60) : W - 30;
    for (let x = 30; x < end;) {
      const word = 6 + Math.floor(rand() * 26);
      fill(x, y, Math.min(word, end - x), 5, 40);
      x += word + 5;
    }
  }
  fill(Math.round(figure.x * W), Math.round(figure.y * H), Math.round(figure.w * W), Math.round(figure.h * H), 90);
  return { width: W, height: H, data: px };
}

/** The page photographed: seen through `quad` (normalized) in a 320x420 frame over a dark, grainy table,
 * each frame pixel the average of 3x3 points so text blurs into tone as a lens would. */
function photograph(page: GrayImage, quad: Quad, light = 1): GrayImage {
  const W = 320;
  const H = 420;
  const toPage = homography(quad, FULL_QUAD);
  const grain = rng(7);
  return image(W, H, (x, y) => {
    let sum = 0;
    for (let sy = 0; sy < 3; sy += 1) {
      for (let sx = 0; sx < 3; sx += 1) {
        const p = applyHomography(toPage, { x: (x + (sx + 0.5) / 3) / W, y: (y + (sy + 0.5) / 3) / H });
        if (p.x < 0 || p.x >= 1 || p.y < 0 || p.y >= 1) sum += 50 + grain() * 20;
        else sum += page.data[Math.floor(p.y * page.height) * page.width + Math.floor(p.x * page.width)] * light;
      }
    }
    return sum / 9;
  });
}

const rotated = (cx: number, cy: number, w: number, h: number, deg: number): Quad => {
  const a = (deg * Math.PI) / 180;
  const corner = (dx: number, dy: number) => ({ x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) });
  return [corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)];
};
const VIEWS: Record<string, Quad> = {
  frontal: [{ x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 }, { x: 0.92, y: 0.92 }, { x: 0.08, y: 0.92 }],
  keystoned: [{ x: 0.22, y: 0.14 }, { x: 0.8, y: 0.1 }, { x: 0.95, y: 0.9 }, { x: 0.04, y: 0.94 }],
  'far and turned': rotated(0.5, 0.5, 0.5, 0.5, 12),
  'close, tilted the other way': [{ x: 0.03, y: 0.04 }, { x: 0.9, y: 0.12 }, { x: 0.97, y: 0.88 }, { x: 0.1, y: 0.97 }],
};
const PAGE_A = textPage(1, { x: 0.1, y: 0.1, w: 0.8, h: 0.25 });
const PAGE_B = textPage(2, { x: 0.1, y: 0.6, w: 0.8, h: 0.3 });
const PAGE_C = textPage(3, { x: 0.55, y: 0.35, w: 0.35, h: 0.3 });
const hashes = new Map<string, string>();
/** The hash of `page` photographed from `view`, each photograph made once. */
const hashOf = (page: GrayImage, view: string, light = 1) => {
  const key = `${[PAGE_A, PAGE_B, PAGE_C].indexOf(page)} ${view} ${light}`;
  if (!hashes.has(key)) hashes.set(key, averageHash(photograph(page, VIEWS[view], light), VIEWS[view]));
  return hashes.get(key)!;
};
const { changeDistance } = DEFAULT_CAPTURE_PARAMS;

describe('averageHash', () => {
  it('is 16 hex chars and stable for the same image', () => {
    const h = averageHash(halves);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(averageHash(halves)).toBe(h);
  });
  it('is the same at another resolution', () => {
    expect(hashDistance(averageHash(halves), averageHash(image(128, 96, (x) => (x < 64 ? 20 : 220))))).toBe(0);
  });
  it('differs for a different layout', () => {
    const rows = image(64, 64, (_, y) => (y < 32 ? 20 : 220));
    expect(hashDistance(averageHash(halves), averageHash(rows))).toBeGreaterThan(16);
  });
  it('hashes only the page inside the quad', () => {
    const left = [{ x: 0, y: 0 }, { x: 0.4, y: 0 }, { x: 0.4, y: 1 }, { x: 0, y: 1 }] as Quad;
    expect(hashDistance(averageHash(halves, left), averageHash(halves))).toBeGreaterThan(0);
  });
  it('hashes a quad that makes no perspective as the whole image', () => {
    const flat = [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }] as Quad;
    expect(averageHash(halves, flat)).toBe(averageHash(halves));
  });

  describe('the same page seen another way (SCAN-23)', () => {
    const others = Object.keys(VIEWS).filter((v) => v !== 'frontal');
    it.each(others)('%s: within the change distance of the frontal view', (view) => {
      for (const page of [PAGE_A, PAGE_B, PAGE_C]) {
        const d = hashDistance(hashOf(page, 'frontal'), hashOf(page, view));
        expect(d).toBeLessThanOrEqual(changeDistance);
      }
    });
    it('in dimmer light: within the change distance', () => {
      expect(hashDistance(hashOf(PAGE_A, 'frontal'), hashOf(PAGE_A, 'keystoned', 0.7))).toBeLessThanOrEqual(changeDistance);
    });
    it('different pages: beyond the change distance, from any view', () => {
      const pages = [PAGE_A, PAGE_B, PAGE_C];
      for (let i = 0; i < pages.length; i += 1) {
        for (let j = i + 1; j < pages.length; j += 1) {
          for (const view of Object.keys(VIEWS)) {
            expect(hashDistance(hashOf(pages[i], 'frontal'), hashOf(pages[j], view))).toBeGreaterThan(changeDistance);
          }
        }
      }
    });
  });
});

describe('hashDistance', () => {
  it('counts differing bits', () => {
    expect(hashDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(hashDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hashDistance('0000000000000001', '0000000000000003')).toBe(1);
  });
});
