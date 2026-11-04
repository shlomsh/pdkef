// A photo's two jobs, the same steps on either side of the thread (SCAN-21): inspecting a new photo
// (its preview and its corners) and processing a page (flattened, given its look, kept as JPEGs). Each
// takes a CanvasKit: the page worker's is OffscreenCanvas and createImageBitmap, the main thread's
// fallback is <img> and <canvas> (scanPipeline.ts). The pixel work in between is pure.
import { guessCorners } from '../edges/index.ts';
import { FLAT_PAGE, bentPx, isFlat, measureBend, pageMap, type PageBend } from '../dewarp/index.ts';
import { warpAlong } from '../dewarp/meshWarp.ts';
import { warpPerspective, warpSize } from '../warp.ts';
import { applyFilter, type ScanFilter } from '../filters.ts';
import { insetQuad, scaleQuad, type GrayImage, type Quad, type RgbaImage } from '../quad.ts';

/** The photo is read at most this big; a 48 MP photo would not fit a phone's canvas budget. */
const SOURCE_LONG_EDGE = 3200;
/** About 200 dpi on A4: sharp text, and a three-page scan near a megabyte. */
export const OUTPUT_LONG_EDGE = 2400;
/** The edge guess looks at a small copy; the page's outline survives, the noise does not. */
const GUESS_LONG_EDGE = 320;
/** How far inside its corners a page is cropped: about 0.8% from each edge, a margin's worth. The
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
  /** A small copy for the page strip: phones drop decoded images once their memory budget fills. */
  thumb: Blob;
  /** The largest distance the dewarp moved any point of the page past what its corners alone did, in
   * output pixels; 0 for a page flattened by its corners alone. */
  bentPx: number;
}
/** What a new photo needs on screen: its corners, its shape, and a preview small enough to decode. */
export interface InspectedPhoto { quad: Quad | null; width: number; height: number; preview: Blob }

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

/** A gray copy no longer than GUESS_LONG_EDGE, for the edge guess. */
function grayOf(kit: CanvasKit, image: Decoded): GrayImage {
  const { width, height } = cappedSize(image.width, image.height, GUESS_LONG_EDGE);
  const surface = kit.surface(width, height);
  let data: Uint8ClampedArray;
  try {
    surface.ctx.drawImage(image.source, 0, 0, width, height);
    data = pixelsOf(surface).data;
  } finally {
    surface.free();
  }
  const gray: GrayImage = { width, height, data: new Uint8ClampedArray(width * height) };
  for (let i = 0, j = 0; j < gray.data.length; i += 4, j += 1) {
    gray.data[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return gray;
}

/** The page's corners as the edge guess sees them in this image, or null when it finds no page. */
export async function guessWith(kit: CanvasKit, image: Blob): Promise<Quad | null> {
  const decoded = await kit.decode(image);
  try {
    return guessCorners(grayOf(kit, decoded));
  } finally {
    decoded.close();
  }
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
  try {
    preview = await surface.toBlob('image/jpeg', PREVIEW_QUALITY);
  } finally {
    surface.free();
  }
  return { quad: await guessWith(kit, preview), width, height, preview };
}

/** The page's bend beyond its corners; a measuring failure leaves the page flat and is handed back. */
function bendOf(src: RgbaImage, quad: Quad, width: number, height: number): { bend: PageBend; error: unknown } {
  try {
    return { bend: measureBend(src, quad, EDGE_INSET / 2, width, height), error: null };
  } catch (error) {
    // expected: handed back with the page, and reported on the main thread (a worker cannot report)
    return { bend: FLAT_PAGE, error };
  }
}

/** The pure middle of processing a page: the photo's pixels flattened to its corners and its bend, then
 * given its look. */
function flattenPixels(src: RgbaImage, quad: Quad, filter: ScanFilter): { image: RgbaImage; bentPx: number; measureError: unknown } {
  const quadPx = scaleQuad(insetQuad(quad, EDGE_INSET), src.width, src.height);
  const { width, height } = warpSize(quadPx, OUTPUT_LONG_EDGE);
  const { bend, error } = bendOf(src, quad, width, height);
  // A flat page keeps the plain homography, exactly as before SCAN-17.
  const warped = isFlat(bend)
    ? warpPerspective(src, quadPx, width, height)
    : warpAlong(src, pageMap(scaleQuad(quad, src.width, src.height), EDGE_INSET / 2, bend), width, height);
  return { image: applyFilter(warped, filter), bentPx: bentPx(bend, EDGE_INSET / 2, width, height), measureError: error };
}

/** One page: flattened to its corners, given its look, kept as a high-quality JPEG and a thumb. */
export async function processWith(kit: CanvasKit, photo: Blob, quad: Quad, filter: ScanFilter): Promise<ProcessedWithReport> {
  const decoded = await kit.decode(photo);
  let source: Surface;
  try {
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
  const flat = flattenPixels(src, quad, filter);
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
    return { page, measureError: flat.measureError };
  } finally {
    out.free();
    small.free();
  }
}
