// A photo's two jobs, the same steps on either side of the thread (SCAN-21): inspecting a new photo
// (its preview and its corners) and processing a page (flattened, given its look, kept as JPEGs). Each
// takes a CanvasKit: the page worker's is OffscreenCanvas and createImageBitmap, the main thread's
// fallback is <img> and <canvas> (scanPipeline.ts). The pixel work in between is pure.
import { guessCorners } from '../edges/index.ts';
import { repairGuess } from '../edges/repair.ts';
import { traceSides, type Pins, type Sides } from '../edges/follow.ts';
import { FLAT_PAGE, bentPx, measureBend, type EdgeCurves, type PageBend } from '#lib/pageEnhance/dewarp/index.ts';
import { spreadQuads } from '#lib/pageEnhance/plan.ts';
import type { Spine } from '#lib/pageEnhance/spine.ts';
import { applyPiece, pieceMargin, type Piece } from '#lib/pageEnhance/piece.ts';
import { warpSizeFor } from '#lib/pageEnhance/warp.ts';
import { pageAspect, snapPaper } from '../aspect.ts';
import { FULL_QUAD } from '../quad.ts';
import { uprightTurns } from './upright.ts';
import { curvesFromSides } from './tracedCurves.ts';
import { fillFoldedCorners } from '../foldedCorners.ts';
import { evenMargins } from '../evenMargins.ts';
import { applyFilter, type ScanFilter } from '../filters.ts';
import { insetQuad, scaleQuad, type GrayImage, type Quad, type RgbaImage } from '#lib/pageEnhance/quad.ts';

/** The photo is read at most this big; a 48 MP photo would not fit a phone's canvas budget. */
export const SOURCE_LONG_EDGE = 3200;
/** About 200 dpi on A4: sharp text, and a three-page scan near a megabyte. */
export const OUTPUT_LONG_EDGE = 2400;
/** The edge guess looks at a small copy; the page's outline survives, the noise does not. */
const GUESS_LONG_EDGE = 320;
const FOLLOW_LONG_EDGE = 1000; // the size edge following was measured at on photos (SCAN-75)
/** The long edge of the gray copy the corner editor's trace reads: the size the edge following was tuned at, where it
 * reproduces the hand-traced borders (at 1000 px two of 22 pages drift by 5 to 7 px; SCAN-75). */
const TRACE_LONG_EDGE = 1536;
/** The spread finder and the per-page read are tuned for a sheet about this big on its long edge. */
const SPLIT_LONG_EDGE = 1000;
/** How far inside its corners a photographed page is cropped (a PDF sheet is not): about 0.8% from each edge, a margin's worth. The
 * edge guess works on a 320px copy, so a corner can sit a pixel of that (0.3%) out on the table, and
 * that sliver turns into a black line under the Document look (QA, 2026-10-26). */
const EDGE_INSET = 0.016;
/** A processed page is kept at this quality; the PDF is encoded from it. */
const KEEP_QUALITY = 0.92;
/** The corner editor and loupe show this, never the photo itself: 12 MP decodes to 48 MB, and iPhone
 * Safari drops images (they render at zero size) once its decoded-image budget fills. 2.5x of a phone
 * width still has the pixels the loupe needs. */
const PREVIEW_LONG_EDGE = 1600;
const PREVIEW_QUALITY = 0.85;
const THUMB_LONG_EDGE = 480;
const THUMB_QUALITY = 0.8;

export interface ProcessedPage {
  blob: Blob;
  width: number;
  height: number;
  /** A small copy for the page grid: phones drop decoded images once their memory budget fills. */
  thumb: Blob;
  /** The largest distance the dewarp moved any point of the page past what its corners alone did, in
   * output pixels; 0 for a page flattened by its corners alone. */
  bentPx: number;
}
/** What a new photo needs on screen: its corners, its shape, and a preview small enough to decode. */
export interface InspectedPhoto {
  quad: Quad | null;
  width: number;
  height: number;
  preview: Blob;
  /** Quarter turns clockwise that stand the page upright (upright.ts); 0 when no corners were found. */
  turns: number;
}

/** A processed page, and the error measuring its bend threw, if it did: the page is then flattened by
 * its corners alone, and the caller reports the error (a worker cannot). */
export interface ProcessedWithReport { page: ProcessedPage; measureError: unknown }

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A canvas of either kind, with what the steps need of it. */
interface Surface {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: Context2D;
  toBlob(type: string, quality: number): Promise<Blob>;
  /** Gives the pixels back at once: a phone holds only so many canvases. */
  free(): void;
}

/** A decoded photo, upright (EXIF orientation applied). */
interface Decoded { source: CanvasImageSource; width: number; height: number; close(): void }

export interface CanvasKit {
  surface(width: number, height: number): Surface;
  decode(blob: Blob): Promise<Decoded>;
}

/** The size `width` x `height` takes with its long edge capped at `longEdge`, then scaled by `scale`. */
function cappedSize(width: number, height: number, longEdge: number, scale = 1): { width: number; height: number } {
  const fit = Math.min(1, longEdge / Math.max(width, height)) * scale;
  return { width: Math.max(1, Math.round(width * fit)), height: Math.max(1, Math.round(height * fit)) };
}

/** The image on a white canvas no longer than `longEdge` (times `scale`). */
export function drawCapped(kit: CanvasKit, image: Decoded, longEdge: number, scale = 1): Surface {
  const { width, height } = cappedSize(image.width, image.height, longEdge, scale);
  const surface = kit.surface(width, height);
  surface.ctx.fillStyle = '#fff';
  surface.ctx.fillRect(0, 0, width, height);
  surface.ctx.drawImage(image.source, 0, 0, width, height);
  return surface;
}

const pixelsOf = ({ canvas, ctx }: Surface): ImageData => ctx.getImageData(0, 0, canvas.width, canvas.height);

const luma = (data: Uint8ClampedArray, width: number, height: number): GrayImage => {
  const gray: GrayImage = { width, height, data: new Uint8ClampedArray(width * height) };
  for (let i = 0, j = 0; j < gray.data.length; i += 4, j += 1) {
    gray.data[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return gray;
};

/** A gray copy no longer than `longEdge`, for the edge guess and the edge trace. */
function grayOf(kit: CanvasKit, image: Decoded, longEdge: number): GrayImage {
  const { width, height } = cappedSize(image.width, image.height, longEdge);
  const surface = kit.surface(width, height);
  let data: Uint8ClampedArray;
  try {
    surface.ctx.drawImage(image.source, 0, 0, width, height);
    data = pixelsOf(surface).data;
  } finally {
    surface.free();
  }
  return luma(data, width, height);
}

/** The page's corners as the edge guess sees them in this image, or null when it finds no page. */
export async function guessWith(kit: CanvasKit, image: Blob): Promise<Quad | null> {
  const decoded = await kit.decode(image);
  try {
    const guess = guessCorners(grayOf(kit, decoded, GUESS_LONG_EDGE));
    return guess && repairGuess(guess, grayOf(kit, decoded, FOLLOW_LONG_EDGE));
  } finally {
    decoded.close();
  }
}

/** The paper's edge along each side of `quad` (0 to 1 of the photo); throws when the photo cannot be decoded, as guessWith does. */
export async function traceWith(kit: CanvasKit, image: Blob, quad: Quad, pins: Pins | null = null): Promise<Sides | null> {
  const decoded = await kit.decode(image);
  try {
    return traceSides(grayOf(kit, decoded, TRACE_LONG_EDGE), quad, pins);
  } finally {
    decoded.close();
  }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** The two pages' corners (left page first, 0 to 1 of the picture) for a line the person placed: each page read on its own,
 * as a sheet split on its own is. Corners are held on the picture, where the corner editor can reach them. */
export async function splitWith(kit: CanvasKit, image: Blob, spine: Spine): Promise<Quad[]> {
  const decoded = await kit.decode(image);
  let surface: Surface;
  try {
    surface = drawCapped(kit, decoded, SPLIT_LONG_EDGE);
  } finally {
    decoded.close();
  }
  let gray: GrayImage;
  try {
    gray = luma(pixelsOf(surface).data, surface.canvas.width, surface.canvas.height);
  } finally {
    surface.free();
  }
  return spreadQuads(gray, spine).map((quad) => quad.map(({ x, y }) => ({ x: clamp01(x), y: clamp01(y) })) as Quad);
}

/** One decode of a new photo: its corners, its upright size, and the preview the screen shows. The
 * corners are guessed from the preview's own JPEG, exactly as Auto-detect guesses them (guessPage on
 * the same bytes), so the first corners and Auto-detect's are the same corners. */
export async function inspectWith(kit: CanvasKit, photo: Blob): Promise<InspectedPhoto> {
  const decoded = await kit.decode(photo);
  const { width, height } = decoded;
  let surface: Surface;
  try {
    surface = drawCapped(kit, decoded, PREVIEW_LONG_EDGE);
  } finally {
    decoded.close();
  }
  let preview: Blob;
  let pixels: ImageData;
  try {
    preview = await surface.toBlob('image/jpeg', PREVIEW_QUALITY);
    pixels = pixelsOf(surface);
  } finally {
    surface.free();
  }
  const quad = await guessWith(kit, preview);
  return { quad, width, height, preview, turns: uprightTurns(pixels, quad ?? FULL_QUAD) };
}

/** The page's bend beyond its corners; a measuring failure leaves the page flat and is handed back. `traced`, when given
 * (an object or null), is the page's border the editor drew: the page's own edges are then not searched. */
function bendOf(src: RgbaImage, quad: Quad, inset: number, width: number, height: number, paperEdges: boolean, traced?: EdgeCurves | null): { bend: PageBend; error: unknown } {
  try {
    const bend = traced === undefined
      ? measureBend(src, quad, inset / 2, width, height, paperEdges)
      : measureBend(src, quad, inset / 2, width, height, paperEdges, traced);
    return { bend, error: null };
  } catch (error) {
    // expected: handed back with the page, and reported on the main thread (a worker cannot report)
    return { bend: FLAT_PAGE, error };
  }
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

/** The page's traced border as the editor draws it (the same gray copy and trace), as the side curves the bend measure
 * reads; `curves` undefined for a whole-picture page, which has none, and for a page whose person has not turned Fine-tune edges on
 * (`fine`); pins on such a page are ignored. A failure is handed back, and the page is then
 * measured as before. */
function tracedFor(kit: CanvasKit, decoded: Decoded, quad: Quad, pins: Pins | null, fine: boolean): { curves: EdgeCurves | null | undefined; error: unknown } {
  if (!fine || isWholePicture(quad)) return { curves: undefined, error: null };
  try {
    const gray = grayOf(kit, decoded, TRACE_LONG_EDGE);
    return { curves: curvesFromSides(quad, traceSides(gray, quad, pins), gray.width, gray.height), error: null };
  } catch (error) {
    // expected: handed back with the page, which is then flattened as it was before the trace
    return { curves: undefined, error };
  }
}

/** One page: flattened to its corners, given its look, kept as a high-quality JPEG and a thumb. */
export async function processWith(kit: CanvasKit, photo: Blob, quad: Quad, filter: ScanFilter, paperEdges = true, pins: Pins | null = null, fine = false): Promise<ProcessedWithReport> {
  const decoded = await kit.decode(photo);
  let source: Surface;
  let traced: ReturnType<typeof tracedFor>;
  try {
    traced = tracedFor(kit, decoded, quad, pins, fine);
    source = drawCapped(kit, decoded, SOURCE_LONG_EDGE);
  } finally {
    decoded.close();
  }
  let src: ImageData;
  try {
    src = pixelsOf(source);
  } finally {
    source.free();
  }
  const flat = flattenPixels(src, quad, filter, paperEdges, traced.curves);
  const { width, height } = flat.image;
  const out = kit.surface(width, height);
  const thumbSize = cappedSize(width, height, THUMB_LONG_EDGE);
  const small = kit.surface(thumbSize.width, thumbSize.height);
  try {
    out.ctx.putImageData(new ImageData(flat.image.data as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
    small.ctx.drawImage(out.canvas, 0, 0, thumbSize.width, thumbSize.height);
    const page: ProcessedPage = {
      blob: await out.toBlob('image/jpeg', KEEP_QUALITY),
      width,
      height,
      thumb: await small.toBlob('image/jpeg', THUMB_QUALITY),
      bentPx: flat.bentPx,
    };
    return { page, measureError: flat.measureError ?? traced.error };
  } finally {
    out.free();
    small.free();
  }
}
