// The pure middle of a photo's two pixel jobs (SCAN-21): flattening a page's pixels to its corners and its bend, and
// reading the corners of the two pages of a spread. steps.ts decodes and draws on either side of the thread; nothing here
// touches a canvas, so it runs on plain typed arrays.
import { traceSides, type Pins } from '../edges/follow.ts';
import { FLAT_PAGE, bentPx, measureBend, type EdgeCurves, type PageBend } from '#lib/pageEnhance/dewarp/index.ts';
import { spreadQuads } from '#lib/pageEnhance/plan.ts';
import type { Spine } from '#lib/pageEnhance/spine.ts';
import { applyPiece, pieceMargin, type Piece } from '#lib/pageEnhance/piece.ts';
import { warpSizeFor } from '#lib/pageEnhance/warp.ts';
import { pageAspect, snapPaper } from '../aspect.ts';
import { curvesFromSides } from './tracedCurves.ts';
import { fillFoldedCorners } from '../foldedCorners.ts';
import { evenMargins } from '../evenMargins.ts';
import { applyFilter, type ScanFilter } from '../filters.ts';
import { insetQuad, scaleQuad, type GrayImage, type Quad, type RgbaImage } from '#lib/pageEnhance/quad.ts';

/** About 200 dpi on A4: sharp text, and a three-page scan near a megabyte. */
export const OUTPUT_LONG_EDGE = 2400;
/** How far inside its corners a photographed page is cropped (a PDF sheet is not): about 0.8% from each edge, a margin's worth. The
 * edge guess works on a 320px copy, so a corner can sit a pixel of that (0.3%) out on the table, and
 * that sliver turns into a black line under the Document look (QA, 2026-10-26). */
const EDGE_INSET = 0.016;

/** `fn`'s value, or `fallback` and the error it threw: a failing step is handed back with the page instead of stopping it. @testSeam */
export function settle<T>(fn: () => T, fallback: T): { value: T; error: unknown } {
  try {
    return { value: fn(), error: null };
  } catch (error) {
    // expected: handed back with the page, which carries on without this step
    return { value: fallback, error };
  }
}

/** The page's bend beyond its corners; a measuring failure leaves the page flat and is handed back. `traced`, when given
 * (an object or null), is the page's border the editor drew: the page's own edges are then not searched. */
function bendOf(src: RgbaImage, quad: Quad, inset: number, width: number, height: number, paperEdges: boolean, traced?: EdgeCurves | null): { bend: PageBend; error: unknown } {
  const { value: bend, error } = settle(() => (traced === undefined
    ? measureBend(src, quad, inset / 2, width, height, paperEdges)
    : measureBend(src, quad, inset / 2, width, height, paperEdges, traced)), FLAT_PAGE);
  return { bend, error };
}

/** The pure middle of processing a page: the photo's pixels flattened to its corners and its bend, then
 * given its look. */
function flattenPixels(src: RgbaImage, quad: Quad, filter: ScanFilter, paperEdges: boolean, traced?: EdgeCurves | null): { image: RgbaImage; bentPx: number; measureError: unknown } {
  const inset = paperEdges ? EDGE_INSET : 0;
  const quadPx = scaleQuad(insetQuad(quad, inset), src.width, src.height);
  const aspect = pageAspect(quadPx, src.width, src.height);
  const { width, height } = warpSizeFor(quadPx, OUTPUT_LONG_EDGE, aspect === null ? null : snapPaper(aspect));
  const { bend, error } = bendOf(src, quad, inset, width, height, paperEdges, traced);
  const piece: Piece = { quad, inset, width, height, bend, mesh: null };
  const warped = fillFoldedCorners(applyPiece(src, piece));
  // A photographed page's text is centred between even margins (SCAN-76); a scanned sheet is left as it was scanned.
  const page = paperEdges ? evenMargins(warped) : warped;
  return { image: applyFilter(page, filter), bentPx: bentPx(bend, pieceMargin(piece), width, height), measureError: error };
}

/** True when every corner is a corner of the picture, in any order: such a page has no border to trace. */
const isWholePicture = (quad: Quad): boolean => quad.every(({ x, y }) => (x === 0 || x === 1) && (y === 0 || y === 1));

/** The gray copy the page's border is traced on: read through `read` only for a page whose person has turned Fine-tune edges
 * on (`fine`) and that is not the whole picture, which has no border to trace; otherwise `gray` is null (pins on such a page
 * are ignored). A failure to read it is handed back, and the page is then measured as before. */
export function traceGray(quad: Quad, fine: boolean, read: () => GrayImage): { gray: GrayImage | null; error: unknown } {
  if (!fine || isWholePicture(quad)) return { gray: null, error: null };
  const { value: gray, error } = settle<GrayImage | null>(read, null);
  return { gray, error };
}

/** The page's traced border as the editor draws it (the same gray copy and trace), as the side curves the bend measure
 * reads; `curves` undefined when there is no gray copy to trace. A failure is handed back, and the page is then
 * measured as before. */
function tracedFromGray(gray: GrayImage | null, quad: Quad, pins: Pins | null): { curves: EdgeCurves | null | undefined; error: unknown } {
  if (!gray) return { curves: undefined, error: null };
  const { value: curves, error } = settle<EdgeCurves | null | undefined>(() => curvesFromSides(quad, traceSides(gray, quad, pins), gray.width, gray.height), undefined);
  return { curves, error };
}

/** A page's pixels flattened to its corners and given its look; `gray` is the copy its border is traced on, when it is traced
 * (traceGray). A measuring or tracing failure leaves the page flattened by its corners alone and is handed back. */
export function processPixels(src: RgbaImage, gray: GrayImage | null, quad: Quad, filter: ScanFilter, paperEdges: boolean, pins: Pins | null): { image: RgbaImage; bentPx: number; measureError: unknown } {
  const traced = tracedFromGray(gray, quad, pins);
  const flat = flattenPixels(src, quad, filter, paperEdges, traced.curves);
  return { image: flat.image, bentPx: flat.bentPx, measureError: flat.measureError ?? traced.error };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** The two pages' corners (left page first) for a line the person placed on `gray`, held on the picture (0 to 1), where the corner editor can reach them. */
export function splitFromGray(gray: GrayImage, spine: Spine): Quad[] {
  return spreadQuads(gray, spine).map((quad) => quad.map(({ x, y }) => ({ x: clamp01(x), y: clamp01(y) })) as Quad);
}
