// Whether an opened file is a crooked scan (PE-06): which pages to look at, which of them are pictures of a
// whole sheet, and what the sheets add up to. Pure; pdf.js comes in as arguments so this file loads without it.
import { MIN_LEAN_DEGREES, type Assessment } from '#lib/pageEnhance/plan.ts';

export type ScanVerdict = 'sideways' | 'spread' | 'lean' | 'bent' | 'straight';

/** Pages looked at: enough to outvote one odd page, few enough that the check stays quick. */
const SAMPLE_COUNT = 5;
/** A scan is one picture of the whole sheet; a report with a big figure is not. */
export const MIN_IMAGE_COVER = 0.8;

/** Up to five 1-based pages spread evenly over the file; a cover says little, so it is skipped in a longer file. */
export function samplePages(numPages: number): number[] {
  if (numPages <= SAMPLE_COUNT) return Array.from({ length: numPages }, (_, i) => i + 1);
  const gaps = SAMPLE_COUNT - 1;
  return Array.from({ length: SAMPLE_COUNT }, (_, i) => Math.round(2 + (i * (numPages - 2)) / gaps));
}

/** Whether at least half of `sheets` pass `test`, so one odd sheet never decides. */
const half = (sheets: Assessment[], test: (a: Assessment) => boolean) => sheets.filter(test).length * 2 >= sheets.length;

/** What the sampled sheets say about the file. Crooked only when at least half are, by the first reason at least half share. */
export function scanVerdict(sheets: Assessment[]): ScanVerdict {
  if (!sheets.length || !half(sheets, (a) => a.crooked)) return 'straight';
  if (half(sheets, (a) => !!a.spine)) return 'spread';
  if (half(sheets, (a) => a.turn !== 0)) return 'sideways';
  if (half(sheets, (a) => a.leans.some((l) => Math.abs(l) >= MIN_LEAN_DEGREES))) return 'lean';
  return 'bent';
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m` applied first, then `ctm`: how a `transform` operator extends the current matrix. */
function concat(m: Matrix, ctm: Matrix): Matrix {
  return [
    m[0] * ctm[0] + m[1] * ctm[2], m[0] * ctm[1] + m[1] * ctm[3],
    m[2] * ctm[0] + m[3] * ctm[2], m[2] * ctm[1] + m[3] * ctm[3],
    m[4] * ctm[0] + m[5] * ctm[2] + ctm[4], m[4] * ctm[1] + m[5] * ctm[3] + ctm[5],
  ];
}

/** The unit square under `m`, as its bounding box. */
function unitBox([a, b, c, d, e, f]: Matrix) {
  const xs = [e, e + a, e + c, e + a + c];
  const ys = [f, f + b, f + d, f + b + d];
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

const overlap = (lo: number, hi: number, from: number, to: number) => Math.max(0, Math.min(hi, to) - Math.max(lo, from));

/**
 * The share of the page (0..1) covered by painted images, read from pdf.js's operator list. Operator
 * coordinates are PDF user space, so a view box that does not start at zero is passed as `origin`. The areas
 * are summed, so a scan cut into strips counts whole; text drawn over the picture is not looked at.
 */
export function imageCover(
  ops: { fnArray: number[]; argsArray: unknown[][] },
  pageWidth: number,
  pageHeight: number,
  OPS: Record<string, number>,
  origin = { x: 0, y: 0 },
): number {
  const paints = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject]);
  const saved: Matrix[] = [];
  let ctm = IDENTITY;
  let area = 0;
  ops.fnArray.forEach((fn, i) => {
    if (fn === OPS.save) saved.push(ctm);
    else if (fn === OPS.restore) ctm = saved.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = concat(ops.argsArray[i] as Matrix, ctm);
    else if (paints.has(fn)) {
      const box = unitBox(ctm);
      area += overlap(box.x0, box.x1, origin.x, origin.x + pageWidth) * overlap(box.y0, box.y1, origin.y, origin.y + pageHeight);
    }
  });
  return Math.min(1, area / (pageWidth * pageHeight));
}
