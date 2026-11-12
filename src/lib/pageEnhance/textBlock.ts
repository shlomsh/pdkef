// The page's text block, squared (PE-11): the justified rows give the left and right edges, the
// first and last row give the top and bottom, and the corners reach out from there to the margins.
// Pure: pixels in, numbers out.
import { findTextRows, type TextRow } from '../pageLayout/textRows.ts';
import { applyHomography, homography } from './homography.ts';
import type { GrayImage, Point, Quad, RgbaImage } from './quad.ts';

/** A row shorter than this share of the page is a heading, a last line or a stray mark, not an edge. */
const MIN_ROW_WIDTH = 0.45;
/** An edge needs this many rows to be a line and not a coincidence. */
export const MIN_ROWS = 6;
/** Rows this far apart (share of the rows' height) give a line steady enough to count the others against. */
const MIN_PAIR_SPAN = 0.1;
/** A row end this near the line (share of the page width) is on the edge: a justified end sits within a pixel or two. */
const INLIER_TOLERANCE = 0.003;
/** An edge held by fewer rows than this is not trusted. */
export const MIN_INLIERS = 4;
/** The page stops this share of the text's width past the text on the spine side: the book's dark gutter starts further out (5.4% at the nearest on the book PDF), and nobody writes there. */
const SPINE_MARGIN = 0.04;
/** A gap this many times the page's median word gap sets a run apart from the row. */
const OUTLIER_GAP_FACTOR = 3;
/** The gray image as RGBA, the shape the row finder takes. */
export const rgbaOf = ({ width, height, data }: GrayImage): RgbaImage => {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 1) out.fill(data[i], i * 4, i * 4 + 3).fill(255, i * 4 + 3, i * 4 + 4);
  return { width, height, data: out };
};

/** Which side of the page the book's spine is on; null on a page that is no half of a spread. */
export type SpineSide = 'left' | 'right' | null;

interface Ends { y: number; left: number; right: number }

const medianOf = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

/** The row's widest run of words: a gap wider than any word gap sets stray marks and spine shadow apart from the text. */
function mainRun(row: TextRow, wordGap: number): { left: number; right: number } {
  const limit = OUTLIER_GAP_FACTOR * wordGap;
  let best = { left: row.left, right: row.left };
  let left = row.left;
  for (const [start, end] of [...row.gaps.filter(([s, e]) => e - s > limit), [row.right, row.right]]) {
    if (start - left > best.right - best.left) best = { left, right: start };
    left = end;
  }
  return best;
}

/** Rows wide enough to be justified lines, with their ends trimmed to the main ink run. */
function wideRows(gray: GrayImage): Ends[] {
  const rows = findTextRows(rgbaOf(gray));
  const wordGap = medianOf(rows.flatMap((row) => row.gaps.map(([s, e]) => e - s)));
  return rows
    .map((row) => ({ y: (row.top + row.bottom) / 2, ...mainRun(row, wordGap) }))
    .filter((r) => r.right - r.left >= MIN_ROW_WIDTH * gray.width);
}

/** The edge x = a + b*y. */
export interface Line { a: number; b: number }

/** x = a + b*y over the points, least squares. */
function leastSquares(points: Array<[number, number]>): Line {
  const n = points.length;
  const my = points.reduce((s, [y]) => s + y, 0) / n;
  const mx = points.reduce((s, [, x]) => s + x, 0) / n;
  let num = 0;
  let den = 0;
  for (const [y, x] of points) { num += (y - my) * (x - mx); den += (y - my) ** 2; }
  const b = den ? num / den : 0;
  return { a: mx - b * my, b };
}

/** An edge and how many points sit on it. */
export interface Edge { line: Line; support: number }

/** The edge most points sit on: every far-enough pair proposes a line, the best-supported wins, then all its points refine it. Null when too few agree. */
export function edgeFit(points: Array<[number, number]>, tolerance: number): Edge | null {
  const span = points[points.length - 1][0] - points[0][0];
  let best: Array<[number, number]> = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dy = points[j][0] - points[i][0];
      if (dy < MIN_PAIR_SPAN * span) continue;
      const b = (points[j][1] - points[i][1]) / dy;
      const a = points[i][1] - b * points[i][0];
      const inliers = points.filter(([y, x]) => Math.abs(a + b * y - x) <= tolerance);
      if (inliers.length > best.length) best = inliers;
    }
  }
  return best.length >= MIN_INLIERS ? { line: leastSquares(best), support: best.length } : null;
}

const fitEdge = (points: Array<[number, number]>, tolerance: number): Line | null => edgeFit(points, tolerance)?.line ?? null;

/** Where the edge x = a + b*y crosses the level row at `y`. */
const at = ({ a, b }: Line, y: number): Point => ({ x: a + b * y, y });

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);

/** Book margins as shares of the text's width, for a page whose sheet edge is not its own. */
interface Margins { side: number; top: number; bottom: number }

/** The text quad with each side pushed out to the page's own margin, or just past the text beside the spine, back in pixels: a corner can land a little off the page, which is white.
 * Given `margins`, the sheet's edge is not the page's (a photo), so each side stops at a book margin of its own. */
export function reachOut(text: Quad, width: number, height: number, spine: SpineSide, margins?: Margins): Quad {
  const w = (dist(text[0], text[1]) + dist(text[3], text[2])) / 2;
  const h = (dist(text[0], text[3]) + dist(text[1], text[2])) / 2;
  const rect: Quad = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const back = homography(rect, text);
  const side = (own: number) => (margins ? margins.side * w : own);
  const left = spine === 'left' ? SPINE_MARGIN * w : side((text[0].x + text[3].x) / 2);
  const right = spine === 'right' ? SPINE_MARGIN * w : side(width - (text[1].x + text[2].x) / 2);
  const top = margins ? margins.top * w : text[0].y;
  const bottom = margins ? margins.bottom * w : height - text[3].y;
  const page: Quad = [{ x: -left, y: -top }, { x: w + right, y: -top }, { x: w + right, y: h + bottom }, { x: -left, y: h + bottom }];
  return page.map((p) => applyHomography(back, p)) as Quad;
}

/**
 * Corners in `gray`'s 0..1 that square the page's text block and reach out to its margins; null with too few rows to fit.
 * `gray` must already be level: rows that lean past each other read as one tall row.
 */
export function textBlockCorners(gray: GrayImage, spine: SpineSide = null): Quad | null {
  const { width, height } = gray;
  const rows = wideRows(gray);
  if (rows.length < MIN_ROWS) return null;
  const tolerance = INLIER_TOLERANCE * width;
  const left = fitEdge(rows.map((r) => [r.y, r.left]), tolerance);
  const right = fitEdge(rows.map((r) => [r.y, r.right]), tolerance);
  if (!left || !right) return null;
  const top = rows[0].y;
  const bottom = rows[rows.length - 1].y;
  const text: Quad = [at(left, top), at(right, top), at(right, bottom), at(left, bottom)];
  return reachOut(text, width, height, spine).map((p) => ({ x: p.x / width, y: p.y / height })) as Quad;
}
