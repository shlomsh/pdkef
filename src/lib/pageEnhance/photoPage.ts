// A phone photo of a book page as Scan's input (SCAN-69): the sheet's edge is the table, fingers or the next page, so
// the page is built from its text. Each line is traced along its own curve, the block's sides are fitted through the
// lines' ends and kept nearly parallel, and the book's other pages say how wide its text block runs. Book margins of
// the block's own size go around it. Pure: pixels in, numbers out.
import { traceLines } from './photoLines.ts';
import type { GrayImage, Point, Quad } from './quad.ts';
import { edgeFit, MIN_INLIERS, MIN_ROWS, reachOut, type Edge, type Line } from './textBlock.ts';

/** The band along the sheet's edges that says whether paper runs to them, a share of the sheet's shorter side. */
const BORDER_BAND = 0.02;
/** Darker than this share of the paper is not paper: the table, a finger, the next page's shadow. */
const NOT_PAPER = 0.6;
/** A sheet whose border band holds more than this share of not-paper is a photo of a page, not a scan cropped to its paper (SCAN-69). */
const PHOTO_BORDER = 0.08;
/** On a photo the rows bow with the page, so their ends sit further from a straight edge than a scan's. */
const PHOTO_INLIER_TOLERANCE = 0.006;
/** On a photo, a window this share of the sheet's shorter side wide, averaging darker than NOT_PAPER, is no paper: text is thin, a table or a finger is not. */
const PAPER_WINDOW = 0.04;
/** On a photo the page is only part of the sheet, so a justified row is a smaller share of it; narrower still for a column beside a figure. */
const PHOTO_MIN_ROW_WIDTH = 0.2;
/** Darker than this share of the paper is print, on a sheet whose non-paper is already painted as paper. */
const PRINT = 0.72;
/** A pixel row between the edges holding this share of the column's width in print is part of the page: a heading, a figure, a running head. */
const PRINT_ROW = 0.01;
/** This many such pixel rows in a run, as a share of the sheet's height, and not a speck. */
const PRINT_RUN = 0.004;
/** A blank this share of the sheet's height ends the page's print, past it is the page's edge. Above the text a chapter
 * opening or a figure leaves a wide blank before its title; below it only a page number follows, a line or two down. */
const PRINT_GAP = { up: 0.25, down: 0.12 };
/** Two sides whose slopes (x per y) differ by more than this are not one text block's: perspective tilts them by up to
 * 0.056 on the measured photos, a side fitted through a figure's ragged lines by 0.17 and more. */
const MAX_SKEW = 0.08;
/** A side held by this many lines, on a page where the two agree, is sure enough to tell the book its width. */
const SURE_SUPPORT = 8;
/** The book's width is trusted once this many pages agree on it. */
const BOOK_PAGES = 2;
/** A block narrower than this share of the book's width is a column beside a figure. A wider one is left as it is: the
 * list of sources is set smaller, so its lines are closer and the book's width in line pitches is too narrow for it. */
const BOOK_NARROW = 0.85;
/** The line pitch is a low percentile of the gaps between lines: a skipped line or a figure only makes gaps longer. */
const PITCH_PERCENTILE = 0.3;

/** What a PDF's sheets read so far say about its book: a book is photographed or scanned as a whole, and its pages
 * share one text width (SCAN-69). */
export interface Book {
  /** Sheets whose own border said photo. */
  photos: number;
  /** Sheets whose own border said scan. */
  scans: number;
  /** The text block's width in line pitches, one per page read sure enough. */
  widths: number[];
}

/** A book before its first sheet. */
export const NEW_BOOK: Book = { photos: 0, scans: 0, widths: [] };

/** A sheet read: whether it is a photo, its page's corners in 0..1 when it is, and the book with this sheet counted. */
interface PhotoRead { photo: boolean; corners: Quad | null; book: Book }

/** A photo's page: book margins around its print, shares of the text's width. */
const PHOTO_MARGIN = { side: 0.08, top: 0.07, bottom: 0.07 };

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** The book's text width in line pitches, once enough pages agree; null before. */
const bookWidth = (book: Book): number | null => (book.widths.length >= BOOK_PAGES ? median(book.widths) : null);

/**
 * Reads `gray`, an upright sheet, as a photo of a page when its own border is not paper or when most of `book`'s sheets
 * so far were photos. The corners are the page's in 0..1; null when its text gives no block.
 */
export function readPhoto(gray: GrayImage, book: Book = NEW_BOOK): PhotoRead {
  const paper = paperLevel(gray);
  const around = surroundings(gray);
  const own = isPhotoSheet(gray, around, paper);
  const counted = { ...book, photos: book.photos + (own ? 1 : 0), scans: book.scans + (own ? 0 : 1) };
  if (!own && book.photos <= book.scans) return { photo: false, corners: null, book: counted };
  const block = photoBlock(paperOnly(gray, around, paper), bookWidth(book));
  if (!block) return { photo: true, corners: null, book: counted };
  const { width, height } = gray;
  const corners = reachOut(block.text, width, height, null, PHOTO_MARGIN).map((p) => ({ x: p.x / width, y: p.y / height })) as Quad;
  return { photo: true, corners, book: block.sure ? { ...counted, widths: [...counted.widths, block.width] } : counted };
}

const byY = (ends: Point[]) => ends.map((p) => [p.y, p.x] as [number, number]).sort((m, n) => m[0] - n[0]);

/** The side through `points` at slope `b`: the offset most of them share. */
function alongSlope(points: Array<[number, number]>, b: number, tolerance: number): Edge | null {
  const offsets = points.map(([y, x]) => x - b * y);
  let best: number[] = [];
  for (const o of offsets) {
    const near = offsets.filter((p) => Math.abs(p - o) <= tolerance);
    if (near.length > best.length) best = near;
  }
  return best.length >= MIN_INLIERS ? { line: { a: best.reduce((s, o) => s + o, 0) / best.length, b }, support: best.length } : null;
}

/** The block's two sides, nearly parallel: a side that leans away from the other, or is not found, is fitted again at
 * the better-held side's slope. `refit` says one was. */
function parallelSides(rows: PhotoRow[], tolerance: number): { left: Edge; right: Edge; refit: boolean } | null {
  const lefts = byY(rows.map((r) => r.left));
  const rights = byY(rows.map((r) => r.right));
  const left = edgeFit(lefts, tolerance);
  const right = edgeFit(rights, tolerance);
  if (left && right && Math.abs(left.line.b - right.line.b) <= MAX_SKEW) return { left, right, refit: false };
  if (left && (!right || left.support >= right.support)) {
    const other = alongSlope(rights, left.line.b, 2 * tolerance);
    return other && { left, right: other, refit: true };
  }
  if (!right) return null;
  const other = alongSlope(lefts, right.line.b, 2 * tolerance);
  return other && { left: other, right, refit: true };
}

const xAt = ({ a, b }: Line, y: number) => a + b * y;
const midY = (row: PhotoRow) => (row.left.y + row.right.y) / 2;

/** The distance from one line to the next: a low percentile of the gaps, null with too few lines to say. */
function linePitch(rows: PhotoRow[]): number | null {
  const ys = rows.map(midY).sort((a, b) => a - b);
  const gaps = ys.slice(1).map((y, i) => y - ys[i]).filter((g) => g > 0).sort((a, b) => a - b);
  return gaps.length >= MIN_ROWS - 1 ? gaps[Math.floor(PITCH_PERCENTILE * gaps.length)] : null;
}

/** How much print lies between the side `edge` and the same side moved `shift` pixels across; -1 when that leaves the sheet. */
function printBeside(gray: GrayImage, edge: Line, shift: number, top: number, bottom: number): number {
  const { width: w, data } = gray;
  const mid = xAt(edge, (top + bottom) / 2) + shift;
  if (mid < 0 || mid > w) return -1;
  const limit = PRINT * paperLevel(gray);
  let ink = 0;
  for (let y = Math.max(0, Math.round(top)); y < Math.min(gray.height, Math.round(bottom)); y += 1) {
    const from = xAt(edge, y);
    const [x0, x1] = shift < 0 ? [from + shift, from] : [from, from + shift];
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(w, Math.round(x1)); x += 1) if (data[y * w + x] < limit) ink += 1;
  }
  return ink;
}

/** A column beside a figure, widened to the book's width toward the print: a drawing or a caption sits on one side of it,
 * the table or the sheet's edge on the other. Unchanged when the block is wide enough, or no side has room. */
function toBookWidth(gray: GrayImage, left: Edge, right: Edge, want: number, top: number, bottom: number): { left: Edge; right: Edge; moved: boolean } {
  const y = (top + bottom) / 2;
  const extra = want - (xAt(right.line, y) - xAt(left.line, y));
  if (extra <= (1 - BOOK_NARROW) * want) return { left, right, moved: false };
  const before = printBeside(gray, left.line, -extra, top, bottom);
  const after = printBeside(gray, right.line, extra, top, bottom);
  if (before < 0 && after < 0) return { left, right, moved: false };
  const moved = (edge: Edge, by: number): Edge => ({ line: { a: edge.line.a + by, b: edge.line.b }, support: 0 });
  return after >= before ? { left, right: moved(right, extra), moved: true } : { left: moved(left, -extra), right, moved: true };
}

/** A photo's text block in pixels, its width in line pitches, and whether it is sure enough to tell the book. `expected`
 * is the book's width in line pitches, null before the book knows it. */
function photoBlock(gray: GrayImage, expected: number | null): { text: Quad; width: number; sure: boolean } | null {
  const traced = photoRows(gray);
  if (traced.length < MIN_ROWS) return null;
  const tolerance = PHOTO_INLIER_TOLERANCE * gray.width;
  const sides = parallelSides(traced, tolerance);
  if (!sides) return null;
  // The block's own lines: both ends between its sides. The next page's lines and a stray mark fall outside.
  const inside = (row: PhotoRow) => row.left.x >= xAt(sides.left.line, row.left.y) - 2 * tolerance && row.right.x <= xAt(sides.right.line, row.right.y) + 2 * tolerance;
  const rows = traced.filter(inside).sort((m, n) => midY(m) - midY(n));
  if (rows.length < MIN_ROWS) return null;
  const pitch = linePitch(rows);
  const [top, bottom] = [rows[0], rows[rows.length - 1]];
  const fitted = expected && pitch
    ? toBookWidth(gray, sides.left, sides.right, expected * pitch, midY(top), midY(bottom))
    : { ...sides, moved: false };
  const { left, right } = fitted;
  const y = (midY(top) + midY(bottom)) / 2;
  const width = pitch ? (xAt(right.line, y) - xAt(left.line, y)) / pitch : 0;
  const sure = !!pitch && !sides.refit && !fitted.moved && left.support >= SURE_SUPPORT && right.support >= SURE_SUPPORT;
  const [first, last] = printSpan(gray, left.line, right.line, midY(top), midY(bottom));
  // The first and last lines' chords, moved up and down to the highest and lowest print between the sides.
  const along = (row: PhotoRow, at: number) => {
    const mid = (row.left.x + row.right.x) / 2;
    const shift = at - (row.left.y + (row.right.y - row.left.y) * ((mid - row.left.x) / (row.right.x - row.left.x || 1)));
    return [{ x: row.left.x, y: row.left.y + shift }, { x: row.right.x, y: row.right.y + shift }] as const;
  };
  const [ta, tb] = along(top, Math.min(first, midY(top)));
  const [ba, bb] = along(bottom, Math.max(last, midY(bottom)));
  const text: Quad = [crossing(left.line, ta, tb), crossing(right.line, ta, tb), crossing(right.line, ba, bb), crossing(left.line, ba, bb)];
  return { text, width, sure };
}

/** A traced line on a photo: its ends, each at its own height, since the line bows and leans with the page. */
interface PhotoRow { left: Point; right: Point }

/** On a photo the rows bow with the page, which a level row finder cannot follow: each line is traced along its own curve. */
function photoRows(gray: GrayImage): PhotoRow[] {
  return traceLines(gray).filter((r) => r.right.x - r.left.x >= PHOTO_MIN_ROW_WIDTH * gray.width);
}

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

/** Where the edge x = a + b*y crosses the straight line through `p` and `q`. */
function crossing({ a, b }: Line, p: Point, q: Point): Point {
  const slope = (q.y - p.y) / (q.x - p.x || 1);
  let x = a + b * p.y;
  for (let k = 0; k < 6; k += 1) x = a + b * (p.y + slope * (x - p.x));
  return { x, y: p.y + slope * (x - p.x) };
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
