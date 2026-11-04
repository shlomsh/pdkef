// Flattening a bent page (SCAN-17): the person's corners give the homography, the page's own edges
// and text lines give the bend on top of it, and one map carries an output pixel all the way back to
// the photo, so the photo is resampled once. Pure: no DOM, no canvas.
import { applyHomography, homography } from '../homography.ts';
import { scaleQuad, type GrayImage, type Quad, type RgbaImage } from '../quad.ts';
import { findEdgeCurves } from './edgeCurves.ts';
import { findLineBend } from './lineBend.ts';
import { warpAlong, type PageMap } from './meshWarp.ts';
import { bendAt, sideAt, type EdgeCurves, type LineBend } from './types.ts';

export type { EdgeCurves, LineBend } from './types.ts';

/** The edges and the lines are measured on a copy this big: a page edge or a text line spans
 * hundreds of its pixels, and the measuring stays well under the warp's own time. */
const MEASURE_LONG_EDGE = 1000;

/** What the page's shape adds to its corners. Both null: a flat page, warped by its corners alone. */
export interface PageBend { curves: EdgeCurves | null; lines: LineBend | null }

export const isFlat = (bend: PageBend) => !bend.curves && !bend.lines;

/**
 * The output (x, y), 0..1 across the page, to photo pixels. `margin` crops that share of the page off
 * every side, along the curved edges; the text-line bend applies first, since it was measured on the
 * page as the edges alone flatten it.
 */
export function pageMap(quadPx: Quad, margin: number, { curves, lines }: PageBend): PageMap {
  const h = homography([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], quadPx);
  const span = 1 - 2 * margin;
  return (x, y) => {
    const s = margin + span * x;
    const t = margin + span * (lines ? y + bendAt(lines, x, y) : y);
    if (!curves) return applyHomography(h, { x: s, y: t });
    // A Coons patch of four curves that each vanish at the corners: the corner terms drop out.
    const u = s + (1 - s) * sideAt(curves.left, t) + s * sideAt(curves.right, t);
    const v = t + (1 - t) * sideAt(curves.top, s) + t * sideAt(curves.bottom, s);
    return applyHomography(h, { x: u, y: v });
  };
}

/** An area-averaged copy no longer than `longEdge` (the image itself when already small enough). */
function shrink(src: RgbaImage, longEdge: number): RgbaImage {
  const k = Math.ceil(Math.max(src.width, src.height) / longEdge);
  if (k <= 1) return src;
  const width = Math.floor(src.width / k);
  const height = Math.floor(src.height / k);
  const data = new Uint8ClampedArray(width * height * 4);
  const area = k * k;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let yy = y * k; yy < y * k + k; yy += 1) {
        for (let p = (yy * src.width + x * k) * 4, end = p + k * 4; p < end; p += 4) {
          r += src.data[p]; g += src.data[p + 1]; b += src.data[p + 2];
        }
      }
      const o = (y * width + x) * 4;
      data[o] = r / area; data[o + 1] = g / area; data[o + 2] = b / area; data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

/** @testSeam The tests read a flattened page's lines with it. */
export function toGray(image: RgbaImage): GrayImage {
  const data = new Uint8ClampedArray(image.width * image.height);
  for (let i = 0, p = 0; i < data.length; i += 1, p += 4) data[i] = 0.299 * image.data[p] + 0.587 * image.data[p + 1] + 0.114 * image.data[p + 2];
  return { width: image.width, height: image.height, data };
}

/** How the page in `src` bends beyond its corners (`quad` normalized, as the person set it). The
 * output's shape (`width` x `height`) sets the shape of the copy the text lines are read from. */
export function measureBend(src: RgbaImage, quad: Quad, margin: number, width: number, height: number): PageBend {
  const small = shrink(src, MEASURE_LONG_EDGE);
  const quadSmall = scaleQuad(quad, small.width, small.height);
  const curves = findEdgeCurves(toGray(small), quadSmall);
  const fit = Math.min(1, MEASURE_LONG_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * fit));
  const h = Math.max(1, Math.round(height * fit));
  const page = warpAlong(small, pageMap(quadSmall, margin, { curves, lines: null }), w, h);
  return { curves, lines: findLineBend(toGray(page)) };
}
