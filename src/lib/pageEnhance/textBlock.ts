// The page's text block, squared (PE-11): the justified rows give the left and right edges, the
// first and last row give the top and bottom, and the corners reach out from there to the margins.
// Pure: pixels in, numbers out.
import { findTextRows, type TextRow } from '../pageLayout/textRows.ts';
import { traceLines } from './photoLines.ts';
import { applyHomography, homography } from './homography.ts';
import type { GrayImage, Point, Quad, RgbaImage } from './quad.ts';

/** A row shorter than this share of the page is a heading, a last line or a stray mark, not an edge. */
const MIN_ROW_WIDTH = 0.45;
/** An edge needs this many rows to be a line and not a coincidence. */
const MIN_ROWS = 6;
/** Rows this far apart (share of the rows' height) give a line steady enough to count the others against. */
const MIN_PAIR_SPAN = 0.1;
/** A row end this near the line (share of the page width) is on the edge: a justified end sits within a pixel or two. */
const INLIER_TOLERANCE = 0.003;
/** An edge held by fewer rows than this is not trusted. */
const MIN_INLIERS = 4;
/** The page stops this share of the text's width past the text on the spine side: the book's dark gutter starts further out (5.4% at the nearest on the book PDF), and nobody writes there. */
const SPINE_MARGIN = 0.04;
/** A gap this many times the page's median word gap sets a run apart from the row. */
const OUTLIER_GAP_FACTOR = 3;
/** The band along the sheet's edges that says whether paper runs to them, a share of the sheet's shorter side. */
const BORDER_BAND = 0.02;
/** Darker than this share of the paper is not paper: the table, a finger, the next page's shadow. */
const NOT_PAPER = 0.6;
/** A sheet whose border band holds more than this share of not-paper is a photo of a page, not a scan cropped to its paper (SCAN-69). */
const PHOTO_BORDER = 0.08;
/** On a photo the rows bow with the page, so their ends sit further from a straight edge than a scan's. */
const PHOTO_INLIER_TOLERANCE = 0.006;
/** A photo's page: book margins around its print, shares of the text's width. */
const PHOTO_MARGIN = { side: 0.08, top: 0.07, bottom: 0.07 };
/** On a photo, a window this share of the sheet's shorter side wide, averaging darker than NOT_PAPER, is no paper: text is thin, a table or a finger is not. */
const PAPER_WINDOW = 0.04;
/** On a photo the page is only part of the sheet, so a justified row is a smaller share of it. */
const PHOTO_MIN_ROW_WIDTH = 0.3;
/** Darker than this share of the paper is print, on a sheet whose non-paper is already painted as paper. */
const PRINT = 0.72;
/** A pixel row between the edges holding this share of the column's width in print is part of the page: a heading, a figure, a running head. */
const PRINT_ROW = 0.01;
/** This many such pixel rows in a run, as a share of the sheet's height, and not a speck. */
const PRINT_RUN = 0.004;
/** A blank this share of the sheet's height ends the page's print, past it is the page's edge. Above the text a chapter
 * opening or a figure leaves a wide blank before its title; below it only a page number follows, a line or two down. */
const PRINT_GAP = { up: 0.25, down: 0.12 };

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

/** A traced line on a photo: its ends, each at its own height, since the line bows and leans with the page. */
interface PhotoRow { left: Point; right: Point }

/** On a photo the rows bow with the page, which a level row finder cannot follow: each line is traced along its own curve. */
function photoRows(gray: GrayImage): PhotoRow[] {
  return traceLines(gray).filter((r) => r.right.x - r.left.x >= PHOTO_MIN_ROW_WIDTH * gray.width);
}

interface Line { a: number; b: number }

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

/** The edge most points sit on: every far-enough pair proposes a line, the best-supported wins, then all its points refine it. Null when too few agree. */
function fitEdge(points: Array<[number, number]>, tolerance: number): Line | null {
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
  return best.length >= MIN_INLIERS ? leastSquares(best) : null;
}

/** Where the edge x = a + b*y crosses the level row at `y`. */
const at = ({ a, b }: Line, y: number): Point => ({ x: a + b * y, y });

const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);

/** The paper's brightness: most of a page is paper, so a high percentile of the sheet. */
function paperLevel({ data }: GrayImage): number {
  const values: number[] = [];
  for (let i = 0; i < data.length; i += 7) values.push(data[i]);
  const sorted = values.sort((a, b) => a - b);
  return sorted[Math.floor(0.9 * (sorted.length - 1))] ?? 255;
}

/** Each pixel's surrounding brightness: the mean over a window about a word wide. Thin print barely moves it; a table, a
 * finger or a dark gutter does. */
function surroundings(gray: GrayImage): Float32Array {
  const { width: w, height: h, data } = gray;
  const r = Math.max(2, Math.round(PAPER_WINDOW * Math.min(w, h) / 2));
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let row = 0;
    for (let x = 0; x < w; x += 1) {
      row += data[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      out[y * w + x] = (sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0]) / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/** The sheet with everything that is not paper painted as paper: the table, fingers, a dark gutter. Text stays, being thin. */
function paperOnly(gray: GrayImage, around: Float32Array, paper: number): GrayImage {
  const limit = NOT_PAPER * paper;
  const out = new Uint8ClampedArray(gray.data);
  for (let i = 0; i < out.length; i += 1) if (around[i] < limit) out[i] = paper;
  return { width: gray.width, height: gray.height, data: out };
}

/** Whether `gray` is a phone photo of a page rather than a scan cropped to its paper. */
export const isPhoto = (gray: GrayImage): boolean => isPhotoSheet(gray, surroundings(gray), paperLevel(gray));

/**
 * Whether the sheet is a photo of a page: its border band is not paper (the table, fingers, the next page), judged by
 * each pixel's surroundings so that print running to the edge of a cropped scan does not count.
 */
function isPhotoSheet(gray: GrayImage, around: Float32Array, paper: number): boolean {
  const { width: w, height: h } = gray;
  const band = Math.max(1, Math.round(BORDER_BAND * Math.min(w, h)));
  const limit = NOT_PAPER * paper;
  let dark = 0;
  let total = 0;
  for (let y = 0; y < h; y += 2) {
    const edgeRow = y < band || y >= h - band;
    for (let x = 0; x < w; x += edgeRow ? 2 : 1) {
      if (!edgeRow && x >= band && x < w - band) { x = w - band - 1; continue; }
      total += 1;
      if (around[y * w + x] < limit) dark += 1;
    }
  }
  return total > 0 && dark / total > PHOTO_BORDER;
}

/** The text quad with each side pushed out to the page's own margin, or just past the text beside the spine, back in pixels: a corner can land a little off the page, which is white.
 * On a photo the sheet's edge is not the page's, so each side stops at a book margin of its own. */
function reachOut(text: Quad, width: number, height: number, spine: SpineSide, photo: boolean): Quad {
  const w = (dist(text[0], text[1]) + dist(text[3], text[2])) / 2;
  const h = (dist(text[0], text[3]) + dist(text[1], text[2])) / 2;
  const rect: Quad = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const back = homography(rect, text);
  const side = (own: number) => (photo ? PHOTO_MARGIN.side * w : own);
  const left = spine === 'left' ? SPINE_MARGIN * w : side((text[0].x + text[3].x) / 2);
  const right = spine === 'right' ? SPINE_MARGIN * w : side(width - (text[1].x + text[2].x) / 2);
  const top = photo ? PHOTO_MARGIN.top * w : text[0].y;
  const bottom = photo ? PHOTO_MARGIN.bottom * w : height - text[3].y;
  const page: Quad = [{ x: -left, y: -top }, { x: w + right, y: -top }, { x: w + right, y: h + bottom }, { x: -left, y: h + bottom }];
  return page.map((p) => applyHomography(back, p)) as Quad;
}

/** Where the edge x = a + b*y crosses the straight line through `p` and `q`. */
function crossing({ a, b }: Line, p: Point, q: Point): Point {
  const slope = (q.y - p.y) / (q.x - p.x || 1);
  let x = a + b * p.y;
  for (let k = 0; k < 6; k += 1) x = a + b * (p.y + slope * (x - p.x));
  return { x, y: p.y + slope * (x - p.x) };
}

/** A photo's text block in pixels: the justified edges through the traced lines' ends, the first and last line's chords across. */
function photoTextQuad(gray: GrayImage): Quad | null {
  const rows = photoRows(gray);
  if (rows.length < MIN_ROWS) return null;
  const tolerance = PHOTO_INLIER_TOLERANCE * gray.width;
  const byY = (ends: Point[]) => ends.map((p) => [p.y, p.x] as [number, number]).sort((m, n) => m[0] - n[0]);
  const left = fitEdge(byY(rows.map((r) => r.left)), tolerance);
  const right = fitEdge(byY(rows.map((r) => r.right)), tolerance);
  if (!left || !right) return null;
  const top = rows[0];
  const bottom = rows[rows.length - 1];
  const [first, last] = printSpan(gray, left, right, (top.left.y + top.right.y) / 2, (bottom.left.y + bottom.right.y) / 2);
  // The first and last lines' chords, moved up and down to the highest and lowest print between the edges.
  const along = (row: PhotoRow, y: number) => {
    const mid = (row.left.x + row.right.x) / 2;
    const shift = y - (row.left.y + (row.right.y - row.left.y) * ((mid - row.left.x) / (row.right.x - row.left.x || 1)));
    return [{ x: row.left.x, y: row.left.y + shift }, { x: row.right.x, y: row.right.y + shift }] as const;
  };
  const [ta, tb] = along(top, Math.min(first, (top.left.y + top.right.y) / 2));
  const [ba, bb] = along(bottom, Math.max(last, (bottom.left.y + bottom.right.y) / 2));
  return [crossing(left, ta, tb), crossing(right, ta, tb), crossing(right, ba, bb), crossing(left, ba, bb)];
}

/** Print rows between the two edges: true where a pixel row holds print, specks aside. */
function printRows(gray: GrayImage, left: Line, right: Line): boolean[] {
  const { width: w, height: h, data } = gray;
  const limit = PRINT * paperLevel(gray);
  const run = Math.max(2, Math.round(PRINT_RUN * h));
  const inked: boolean[] = [];
  for (let y = 0; y < h; y += 1) {
    const x0 = Math.max(0, Math.round(left.a + left.b * y));
    const x1 = Math.min(w, Math.round(right.a + right.b * y));
    let ink = 0;
    for (let x = x0; x < x1; x += 1) if (data[y * w + x] < limit) ink += 1;
    inked.push(x1 > x0 && ink >= PRINT_ROW * (x1 - x0));
  }
  // A run shorter than a speck's is no print.
  const out = inked.slice();
  for (let y = 0; y < h;) {
    let end = y;
    while (end < h && inked[end]) end += 1;
    if (end - y < run) for (let k = y; k < end; k += 1) out[k] = false;
    y = Math.max(end, y + 1);
  }
  return out;
}

/** From the text's first and last line, out through the print above and below it (a heading, a figure, a running head, a
 * page number) until a blank wider than a few lines: past that is the page's edge and whatever lies beyond it. */
function printSpan(gray: GrayImage, left: Line, right: Line, top: number, bottom: number): [number, number] {
  const rows = printRows(gray, left, right);
  const reach = (from: number, step: number) => {
    const gap = Math.round((step < 0 ? PRINT_GAP.up : PRINT_GAP.down) * gray.height);
    let edge = from;
    let blank = 0;
    for (let y = from; y >= 0 && y < rows.length && blank <= gap; y += step) {
      if (rows[y]) { edge = y; blank = 0; } else blank += 1;
    }
    return edge;
  };
  return [reach(Math.round(top), -1), reach(Math.round(bottom), 1)];
}

/**
 * Corners in `gray`'s 0..1 that square the page's text block and reach out to its margins; null with too few rows to fit.
 * `gray` must already be level: rows that lean past each other read as one tall row.
 */
export function textBlockCorners(gray: GrayImage, spine: SpineSide = null): Quad | null {
  const { width, height } = gray;
  const paper = paperLevel(gray);
  const around = surroundings(gray);
  if (isPhotoSheet(gray, around, paper)) {
    const text = photoTextQuad(paperOnly(gray, around, paper));
    return text && (reachOut(text, width, height, spine, true).map((p) => ({ x: p.x / width, y: p.y / height })) as Quad);
  }
  const rows = wideRows(gray);
  if (rows.length < MIN_ROWS) return null;
  const tolerance = INLIER_TOLERANCE * width;
  const left = fitEdge(rows.map((r) => [r.y, r.left]), tolerance);
  const right = fitEdge(rows.map((r) => [r.y, r.right]), tolerance);
  if (!left || !right) return null;
  const top = rows[0].y;
  const bottom = rows[rows.length - 1].y;
  const text: Quad = [at(left, top), at(right, top), at(right, bottom), at(left, bottom)];
  return reachOut(text, width, height, spine, false).map((p) => ({ x: p.x / width, y: p.y / height })) as Quad;
}
