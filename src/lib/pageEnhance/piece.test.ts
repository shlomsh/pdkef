import { describe, expect, it } from 'vitest';
import { FLAT_PAGE, pageMap, type PageBend } from './dewarp/index.ts';
import { warpAlong, type PageMap } from './dewarp/meshWarp.ts';
import { applyPiece, isAffine, pieceMargin, type Piece } from './piece.ts';
import { insetQuad, scaleQuad, type Quad, type RgbaImage } from './quad.ts';
import { seededRandom } from './seededRandom.test-helper.ts';
import { warpPerspective } from './warp.ts';

const W = 120;
const H = 90;

function image(): RgbaImage {
  const rand = seededRandom(7);
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < data.length; i += 1) data[i] = i % 4 === 3 ? 255 : Math.floor(rand() * 256);
  return { width: W, height: H, data };
}

const QUAD: Quad = [{ x: 0.1, y: 0.12 }, { x: 0.92, y: 0.05 }, { x: 0.88, y: 0.94 }, { x: 0.06, y: 0.85 }];
const BEND: PageBend = { curves: null, lines: { nx: 3, ny: 3, d: [0, 0.01, 0, 0, 0.02, 0, 0, 0.01, 0] }, columns: null };
const piece = (over: Partial<Piece> = {}): Piece => ({ quad: QUAD, inset: 0.016, width: 60, height: 80, bend: FLAT_PAGE, mesh: null, ...over });
const mirror: PageMap = (x, y) => ({ x: (1 - x) * (W - 1), y: y * (H - 1) });
const straight: PageMap = (x, y) => ({ x: x * (W - 1), y: y * (H - 1) });

describe('isAffine', () => {
  it('is true only for a flat piece with no mesh', () => {
    expect(isAffine(piece())).toBe(true);
    expect(isAffine(piece({ bend: BEND }))).toBe(false);
    expect(isAffine(piece({ mesh: straight }))).toBe(false);
    expect(isAffine(piece({ bend: BEND, mesh: straight }))).toBe(false);
  });
});

describe('pieceMargin', () => {
  it('is half the inset', () => expect(pieceMargin(piece({ inset: 0.04 }))).toBe(0.02));
});

describe('applyPiece', () => {
  const src = image();
  it('is the plain homography for a flat piece', () => {
    const want = warpPerspective(src, scaleQuad(insetQuad(QUAD, 0.016), W, H), 60, 80);
    expect(Array.from(applyPiece(src, piece()).data)).toEqual(Array.from(want.data));
  });
  it('follows the bend for a bent piece', () => {
    const want = warpAlong(src, pageMap(scaleQuad(QUAD, W, H), 0.016 / 2, BEND), 60, 80);
    expect(Array.from(applyPiece(src, piece({ bend: BEND })).data)).toEqual(Array.from(want.data));
  });
  it('lets a mesh replace the bend', () => {
    const plain = applyPiece(src, piece({ mesh: straight }));
    const flipped = applyPiece(src, piece({ mesh: mirror }));
    const both = applyPiece(src, piece({ mesh: mirror, bend: BEND }));
    expect(Array.from(both.data)).toEqual(Array.from(flipped.data));
    const px = (img: RgbaImage, x: number, y: number) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
    for (const [x, y] of [[3, 5], [10, 40], [20, 70]]) {
      px(flipped, 59 - x, y).forEach((v, c) => expect(Math.abs(v - px(plain, x, y)[c]!)).toBeLessThanOrEqual(1));
    }
  });
});
