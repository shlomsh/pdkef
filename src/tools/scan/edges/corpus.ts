// A deterministic corpus of hard synthetic scenes for the edge guessers, each with known true corners.
// Test-only (imported by corpus.test.ts and the strategy tests). Truth is normalized (0..1).
import type { GrayImage, Point, Quad } from '../quad.ts';
import { addNoise, fillQuad, fillRect, norm, seededRandom, solid } from './testImages.ts';

export interface CorpusCase {
  name: string;
  image: GrayImage;
  /** The page's true corners, normalized, top-left first. */
  truth: Quad;
  /** Null counts as an acceptable answer (the page is partly outside the frame). */
  nullOk?: boolean;
  /** Corner tolerance override for a found case. */
  tol?: number;
}

const PW = 320;
const PH = 427;

function rotated(cx: number, cy: number, hw: number, hh: number, deg: number): Quad {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c })) as Quad;
}

/** Dark tiles of mixed grey, dark grout and diagonal grout lines: a busy floor. */
function floor(w: number, h: number, seed: number): GrayImage {
  const img = solid(w, h, 0);
  const rnd = seededRandom(seed);
  const tiles = [70, 95, 55, 85, 110];
  const cols = Math.ceil(w / 40);
  const rows = Math.ceil(h / 40);
  const tone = new Uint8Array(cols * rows);
  for (let i = 0; i < tone.length; i += 1) tone[i] = tiles[Math.floor(rnd() * tiles.length)];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let v = tone[Math.floor(y / 40) * cols + Math.floor(x / 40)];
      if (x % 40 < 2 || y % 40 < 2) v = 30;
      if ((x - y + 1000) % 61 < 2) v = 38;
      img.data[y * w + x] = v;
    }
  }
  addNoise(img, 6, seed + 1);
  return img;
}

/** A sub-rectangle of a rotated page, in the page's own coordinates (x0..x1, y0..y1 from its centre). */
function part(cx: number, cy: number, deg: number, x0: number, y0: number, x1: number, y1: number): Quad {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c })) as Quad;
}

const norm4 = (q: Quad, w: number, h: number) => q.map((p) => norm(p, w, h)) as Quad;
const cut = (q: Quad): Quad => q.map((p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) })) as Quad;

function build(): CorpusCase[] {
  const cases: CorpusCase[] = [];
  const add = (name: string, img: GrayImage, page: Quad, extra: Partial<CorpusCase> = {}) =>
    cases.push({ name, image: img, truth: norm4(page, img.width, img.height), ...extra });

  { // 1 easy: dark desk, small tilt, noise
    const img = solid(PW, PH, 55); const page = rotated(160, 210, 105, 150, 6);
    fillQuad(img, page, 215); addNoise(img, 8, 11); add('easy tilt 6', img, page);
  }
  { // 2 easy landscape perspective
    const img = solid(PH, PW, 60); const page: Quad = [{ x: 90, y: 50 }, { x: 340, y: 40 }, { x: 390, y: 270 }, { x: 50, y: 280 }];
    fillQuad(img, page, 220); addNoise(img, 8, 12); add('easy landscape perspective', img, page);
  }
  { // 3 tiled floor
    const img = floor(PW, PH, 21); const page = rotated(160, 215, 100, 145, 15);
    fillQuad(img, page, 230); add('tiled floor tilt 15', img, page);
  }
  { // 4 bright patches touching the page
    const img = floor(PW, PH, 22); const page = rotated(165, 210, 95, 140, -10);
    fillRect(img, 20, 60, 50, 70, 195); fillRect(img, 240, 330, 70, 60, 200);
    fillQuad(img, page, 232);
    fillRect(img, 262, 150, 40, 90, 185); // glued to the page's right side
    fillRect(img, 55, 330, 60, 28, 185); // glued to the bottom-left
    add('bright patches touching page', img, page);
  }
  { // 5 bright patches at the frame edge
    const img = floor(PW, PH, 23); const page = rotated(150, 200, 90, 130, 8);
    fillRect(img, 0, 20, 36, 120, 205); fillRect(img, 270, 0, 50, 60, 205); fillRect(img, 120, 395, 120, 32, 200);
    fillQuad(img, page, 235); add('bright patches at frame edge', img, page);
  }
  { // 6 rotated 30
    const img = floor(PW, PH, 24); const page = rotated(160, 213, 85, 120, 30);
    fillQuad(img, page, 228); add('rotated 30', img, page);
  }
  { // 7 rotated -28, landscape
    const img = floor(PH, PW, 25); const page = rotated(213, 160, 140, 90, -28);
    fillQuad(img, page, 228); add('rotated -28 landscape', img, page);
  }
  { // 8 keystone
    const img = floor(PW, PH, 26); const page: Quad = [{ x: 105, y: 45 }, { x: 225, y: 55 }, { x: 305, y: 385 }, { x: 20, y: 370 }];
    fillQuad(img, page, 225); add('strong keystone', img, page);
  }
  { // 9 dark printed band across the page
    const img = floor(PW, PH, 27); const page = rotated(160, 213, 100, 140, 12);
    fillQuad(img, page, 232);
    fillQuad(img, rotated(160, 190, 70, 18, 12), 25);
    add('dark band across page', img, page);
  }
  { // 10 low contrast
    const img = solid(PW, PH, 150); const page = rotated(160, 210, 105, 150, -7);
    fillQuad(img, page, 190); addNoise(img, 5, 31); add('low contrast', img, page);
  }
  { // 11 shadow across a corner
    const img = floor(PW, PH, 28); const page = rotated(160, 210, 100, 145, 4);
    fillQuad(img, page, 232);
    const [, tr] = page;
    fillQuad(img, [{ x: tr.x - 70, y: tr.y - 4 }, { x: tr.x + 4, y: tr.y - 4 }, { x: tr.x + 4, y: tr.y + 60 }, { x: tr.x + 4, y: tr.y + 60 }], 150);
    add('shadow across corner', img, page);
  }
  { // 12 envelope: tiled floor, black stripe, bright patches, dark object over the frame
    const img = floor(PW, PH, 29); const page = rotated(165, 220, 95, 138, 14);
    fillRect(img, 0, 330, 70, 97, 195); fillRect(img, 0, 100, 25, 50, 200); fillRect(img, 255, 0, 65, 28, 200);
    fillQuad(img, page, 238);
    fillQuad(img, rotated(165, 165, 60, 10, 14), 20);
    fillRect(img, 0, 190, 33, 140, 40); // a dark object partly over the frame, beside the page's left
    add('envelope on busy floor', img, page, { tol: 0.05 });
  }
  { // 13 busy textured background
    const img = solid(PW, PH, 90); const rnd = seededRandom(32);
    for (let i = 0; i < 60; i += 1) fillQuad(img, rotated(rnd() * PW, rnd() * PH, 6 + rnd() * 14, 4 + rnd() * 10, rnd() * 90), 40 + rnd() * 120);
    const page = rotated(160, 215, 95, 135, -18);
    fillQuad(img, page, 238); addNoise(img, 14, 33); add('textured background', img, page);
  }
  { // 14 page cut by the frame: one corner outside
    const img = floor(PW, PH, 34); const page = rotated(205, 215, 105, 150, 6);
    fillQuad(img, page, 232);
    add('corner outside frame', img, page, { nullOk: true, tol: 0.04 });
    cases[cases.length - 1].truth = cut(norm4(page, PW, PH));
  }
  { // 15 white envelope, its left quarter a dark printed band, on a tiled floor
    const img = floor(PW, PH, 41); const page = rotated(165, 215, 100, 140, 7);
    fillQuad(img, page, 236); fillQuad(img, part(165, 215, 7, -100, -140, -50, 140), 28);
    add('dark band on left quarter', img, page);
  }
  { // 16 dark-backed card: a dark card on a bright table
    const img = solid(PW, PH, 205); const page = rotated(160, 212, 95, 135, -9);
    fillQuad(img, page, 45); addNoise(img, 8, 42); add('dark card on bright table', img, page);
  }
  { // 17 the page's top edge is darker than the table (a dark header strip), table mid-grey
    const img = solid(PW, PH, 120); const page = rotated(160, 214, 100, 140, 4);
    fillQuad(img, page, 225); fillQuad(img, part(160, 214, 4, -100, -140, 100, -105), 55);
    addNoise(img, 8, 43); add('top edge darker than table', img, page);
  }
  { // 18 dark band along the bottom, page tilted, on a tiled floor
    const img = floor(PW, PH, 44); const page = rotated(160, 212, 95, 140, -12);
    fillQuad(img, page, 232); fillQuad(img, part(160, 212, -12, -95, 85, 95, 140), 30);
    add('dark band along bottom', img, page);
  }
  return cases;
}

export const corpus: CorpusCase[] = build();
export type { Point };
