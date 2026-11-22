import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import { type Quad } from '#lib/pageEnhance/quad.ts';
import { FULL_QUAD } from './quad.ts';
import { SCAN_QUALITY } from './scanBudget.ts';
import { warpPerspective } from '#lib/pageEnhance/warp.ts';
import { buildScanPdf, inspectPhoto, processPage, type ProcessedPage } from './scanPipeline.ts';
import { resetPageWorker } from './pageWork/offThread.ts';
import { withOrientation6 } from './pageWork/exifProbe.ts';
import type { Pins } from './edges/follow.ts';

// The pure collaborators (warp, filters, quad maths, the budget search, imagesToPdf) are the real ones;
// the warp spy only reads the pixel quad the pipeline hands it.
vi.mock('#lib/pageEnhance/warp.ts', { spy: true });

type Rgb = [number, number, number];
const GRAY: Rgb = [128, 128, 128];
const JPEG_STAGE_TOLERANCE = 2;

const canvasOf = (width: number, height: number, pixel: (x: number, y: number) => Rgb) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) image.data.set([...pixel(x, y), 255], (y * width + x) * 4);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
};

const encoded = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no blob'))), type, quality));

const photo = (width: number, height: number, pixel: (x: number, y: number) => Rgb = () => GRAY) =>
  encoded(canvasOf(width, height, pixel), 'image/png');

const decodedPixels = async (blob: Blob) => {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);
  const { width, height } = bitmap;
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);
  return { width, height, at: (x: number, y: number) => [data[(y * width + x) * 4], data[(y * width + x) * 4 + 1], data[(y * width + x) * 4 + 2]] };
};

const q = (...c: number[]): Quad => [{ x: c[0], y: c[1] }, { x: c[2], y: c[3] }, { x: c[4], y: c[5] }, { x: c[6], y: c[7] }];

const createObjectURL = () => vi.spyOn(URL, 'createObjectURL');
const revokeObjectURL = () => vi.spyOn(URL, 'revokeObjectURL');

const onTheMainThread = () => {
  resetPageWorker();
  // forced: a browser with no module worker (older Safari), where every page is processed on the main thread
  vi.stubGlobal('Worker', undefined);
};

beforeEach(() => {
  vi.mocked(warpPerspective).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetPageWorker();
});

describe('processPage: the inset crop', () => {
  beforeEach(onTheMainThread);

  // A 2px dark table border around mid-gray paper: the sliver the edge guess can leave inside its corners.
  const bordered = (width: number, height: number) => photo(width, height, (x, y) => (x < 2 || y < 2 || x >= width - 2 || y >= height - 2 ? [0, 0, 0] : GRAY));

  it('crops 1.6% in from the corners, so the page outline never shows as a dark edge line', async () => {
    const page = await processPage(await bordered(400, 300), FULL_QUAD, 'original');
    const pixels = await decodedPixels(page.blob);
    expect([pixels.width, pixels.height]).toEqual([page.width, page.height]);
    // Every output pixel is paper, within the JPEG stage: the border (and the white past the photo's edge) is cropped away.
    for (let y = 0; y < page.height; y += 1) {
      for (let x = 0; x < page.width; x += 1) {
        pixels.at(x, y).forEach((channel) => expect(Math.abs(channel - 128)).toBeLessThanOrEqual(JPEG_STAGE_TOLERANCE));
      }
    }
  });

  it('warps exactly the inset corners, in photo pixels, and sizes the page from them', async () => {
    const page = await processPage(await photo(400, 300), q(0.1, 0.2, 0.9, 0.1, 0.8, 0.9, 0.2, 0.8), 'original');
    const [src, quadPx, width, height] = vi.mocked(warpPerspective).mock.calls[0];
    expect([src.width, src.height]).toEqual([400, 300]);
    // Each corner moves 1.6% of the way to the quad's centre (0.5, 0.5), then scales to 400 x 300.
    const expected = [[42.56, 61.44], [357.44, 31.92], [318.08, 268.08], [81.92, 238.56]];
    quadPx.forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i][0], 6);
      expect(p.y).toBeCloseTo(expected[i][1], 6);
    });
    expect([width, height]).toEqual([page.width, page.height]);
    // The longer of each pair of opposite edges: top 316.3 / bottom 238.0 wide, left 181.4 / right 239.4 tall.
    // 316/239 = 1.322 is within 3% of US Letter (1.294), so the page snaps to Letter: 316 x 244.
    expect([page.width, page.height]).toEqual([316, 244]);
  });
});

describe('processPage: the JPEGs it keeps', () => {
  beforeEach(onTheMainThread);

  it('keeps the page at quality 0.92 and a thumb of at most 480px at 0.8', async () => {
    const source = await photo(1200, 900);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
    const page = await processPage(source, FULL_QUAD, 'original');
    expect(page.width).toBe(1181);
    expect(page.height).toBe(886);
    expect(toBlob.mock.calls.map(([, type, quality]) => [type, quality])).toEqual([['image/jpeg', 0.92], ['image/jpeg', 0.8]]);
    const kept = await decodedPixels(page.blob);
    const thumb = await decodedPixels(page.thumb);
    expect([kept.width, kept.height, page.blob.type]).toEqual([1181, 886, 'image/jpeg']);
    expect([thumb.width, thumb.height, page.thumb.type]).toEqual([480, 360, 'image/jpeg']);
  });

  it('frees every canvas it made', async () => {
    const source = await photo(400, 300);
    const createElement = vi.spyOn(document, 'createElement');
    await processPage(source, FULL_QUAD, 'original');
    const canvases = createElement.mock.results.filter((_, i) => createElement.mock.calls[i][0] === 'canvas').map((r) => r.value as HTMLCanvasElement);
    expect(canvases.length).toBeGreaterThan(0);
    expect(canvases.every((c) => c.width === 0 && c.height === 0)).toBe(true);
  });
});

describe('the EXIF-aligned load', () => {
  beforeEach(onTheMainThread);

  // A portrait page shot sideways: the file stores 400 x 300 with orientation 6, the browser shows it upright as 300 x 400.
  // Orientation 6 turns the stored picture a quarter clockwise, so the stored bottom half becomes the upright left half.
  const sideways = async (pixel: (x: number, y: number) => Rgb = () => GRAY) => {
    const stored = await encoded(canvasOf(400, 300, pixel), 'image/jpeg', 1);
    return new Blob([withOrientation6(new Uint8Array(await stored.arrayBuffer())) as BlobPart], { type: 'image/jpeg' });
  };

  it('works on the upright photo, so corners set on the preview land on the same pixels', async () => {
    // Left half of the upright photo is dark, right half light.
    const page = await processPage(await sideways((_, y) => (y >= 150 ? [40, 40, 40] : [220, 220, 220])), FULL_QUAD, 'original');
    const src = vi.mocked(warpPerspective).mock.calls[0][0];
    expect([src.width, src.height]).toEqual([300, 400]);
    expect(page.width).toBeLessThan(page.height);
    const pixels = await decodedPixels(page.blob);
    expect(Math.abs(pixels.at(10, 100)[0] - 40)).toBeLessThanOrEqual(2 * JPEG_STAGE_TOLERANCE);
    expect(Math.abs(pixels.at(page.width - 10, 100)[0] - 220)).toBeLessThanOrEqual(2 * JPEG_STAGE_TOLERANCE);
  });

  it('reports the upright size and a preview in that orientation', async () => {
    const inspected = await inspectPhoto(await sideways());
    expect([inspected.width, inspected.height]).toEqual([300, 400]);
    const preview = await decodedPixels(inspected.preview);
    expect([preview.width, preview.height]).toEqual([300, 400]);
  });

  it('releases the object URL after decoding, even when the photo cannot be decoded', async () => {
    const source = await photo(400, 300);
    const made = createObjectURL();
    const revoked = revokeObjectURL();
    await processPage(source, FULL_QUAD, 'original');
    expect(made).toHaveBeenCalledTimes(1);
    expect(revoked).toHaveBeenCalledTimes(1);
    await expect(processPage(new Blob(['not an image'], { type: 'image/jpeg' }), FULL_QUAD, 'original')).rejects.toMatchObject({ name: 'EncodingError' });
    expect(made).toHaveBeenCalledTimes(2);
    expect(revoked).toHaveBeenCalledTimes(2);
    expect(revoked.mock.calls).toEqual(made.mock.results.map((r) => [r.value]));
  });
});

describe('a page worker that is sent a process job', () => {
  beforeEach(() => {
    vi.doUnmock('#lib/pageEnhance/warp.ts');
  });

  it('carries the page\'s pins in the job, and none when it has none', async () => {
    const posted = vi.spyOn(Worker.prototype, 'postMessage');
    const source = await photo(400, 300);
    const pins = [[{ k: 7, at: { x: 0.5, y: 0.1 } }], [], [], []] as Pins;
    await processPage(source, q(0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9), 'original', true, pins);
    await processPage(source, FULL_QUAD, 'original');
    const sent = posted.mock.calls.map(([request]) => (request as { job: { kind: string; pins?: unknown } }).job).filter((job) => job.kind === 'process');
    expect(sent.map((job) => job.pins)).toEqual([pins, null]);
  });

  // Protects: the worker is told whether the person turned Fine-tune edges on, and it is off unless said.
  it('carries fine in the job, off unless told otherwise', async () => {
    const posted = vi.spyOn(Worker.prototype, 'postMessage');
    const source = await photo(400, 300);
    await processPage(source, FULL_QUAD, 'original', false, null, true);
    await processPage(source, FULL_QUAD, 'original');
    const sent = posted.mock.calls.map(([request]) => (request as { job: { kind: string; fine?: unknown } }).job).filter((job) => job.kind === 'process');
    expect(sent.slice(-2).map((job) => job.fine)).toEqual([true, false]);
  });
});

describe('buildScanPdf: the size limit', () => {
  const PAGE_W = 500;
  const PAGE_H = 700;
  const textured = (x: number, y: number): Rgb => {
    const v = 96 + ((x * 7919 + y * 104729 + x * y * 31) % 64);
    return [v, 255 - v, (v * 3) % 256];
  };
  const pages = async (): Promise<ProcessedPage[]> => {
    const blob = await encoded(canvasOf(PAGE_W, PAGE_H, textured), 'image/jpeg', 0.92);
    return [0, 1].map(() => ({ blob, width: PAGE_W, height: PAGE_H, thumb: blob, bentPx: 0 }));
  };
  const readPdf = async (blob: Blob) => (await getPdfLib()).PDFDocument.load(await blob.arrayBuffer());
  // Whether `part`'s bytes appear, in order and unbroken, inside `pdf`.
  const contains = async (pdf: Blob, part: Blob) => {
    const hay = new Uint8Array(await pdf.arrayBuffer());
    const needle = new Uint8Array(await part.arrayBuffer());
    for (let at = hay.indexOf(needle[0]); at >= 0 && at + needle.length <= hay.length; at = hay.indexOf(needle[0], at + 1)) {
      if (needle.every((b, i) => hay[at + i] === b)) return true;
    }
    return false;
  };
  const reencoded = async (page: ProcessedPage, scale: number, quality: number) => {
    const bitmap = await createImageBitmap(page.blob);
    const width = Math.round(PAGE_W * scale);
    const height = Math.round(PAGE_H * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return encoded(canvas, 'image/jpeg', quality);
  };

  it('with no limit builds once, at full scale and the default quality', async () => {
    const input = await pages();
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
    const result = await buildScanPdf(input, { pageSize: 'fit', budgetBytes: null });
    expect(result).toMatchObject({ metTarget: true, scale: 1, quality: SCAN_QUALITY });
    // One encode a page, none repeated for the result view.
    expect(toBlob.mock.calls.map(([, type, quality]) => [type, quality])).toEqual([['image/jpeg', SCAN_QUALITY], ['image/jpeg', SCAN_QUALITY]]);
    expect(result.pages).toHaveLength(2);
    for (const page of result.pages) {
      const shown = await decodedPixels(page.blob);
      expect([shown.width, shown.height]).toEqual([PAGE_W, PAGE_H]);
    }
  });

  it('steps the JPEG quality down until the PDF is under the limit', async () => {
    const input = await pages();
    const full = await buildScanPdf(input, { pageSize: 'fit', budgetBytes: null });
    const budget = Math.floor(full.blob.size * 0.8);
    const result = await buildScanPdf(input, { pageSize: 'fit', budgetBytes: budget });
    expect(result.metTarget).toBe(true);
    expect(result.blob.size).toBeLessThanOrEqual(budget);
    expect(result.scale).toBe(1);
    expect(result.quality).toBeLessThan(SCAN_QUALITY);
    expect(result.quality).toBeGreaterThan(0.3);
    // The pages are re-encoded at the winning quality, not left at some other step's.
    const expected = await reencoded(input[0], 1, result.quality);
    expect(result.pages.map((p) => p.blob.size)).toEqual([expected.size, expected.size]);
  });

  it('shrinks the pixels when quality alone cannot reach the limit, and keeps the printed size', async () => {
    const input = await pages();
    const full = await buildScanPdf(input, { pageSize: 'fit', budgetBytes: null });
    const budget = Math.floor(full.blob.size * 0.1);
    const result = await buildScanPdf(input, { pageSize: 'fit', budgetBytes: budget });
    expect(result.metTarget).toBe(true);
    expect(result.blob.size).toBeLessThanOrEqual(budget);
    expect(result.scale).toBeLessThan(1);
    const [first] = result.pages;
    expect(first.place.pageWidth).toBeCloseTo((PAGE_W * 72) / 200, 6);
    expect(first.place.pageHeight).toBeCloseTo((PAGE_H * 72) / 200, 6);
    const shown = await decodedPixels(first.blob);
    expect([shown.width, shown.height]).toEqual([Math.round(PAGE_W * result.scale), Math.round(PAGE_H * result.scale)]);
    // The PDF's own page is that size too, though its JPEG has fewer pixels.
    const pdfPage = (await readPdf(result.blob)).getPage(0);
    expect(pdfPage.getWidth()).toBeCloseTo((PAGE_W * 72) / 200, 1);
    expect(pdfPage.getHeight()).toBeCloseTo((PAGE_H * 72) / 200, 1);
  });

  it('hands back the very JPEGs that sit inside the PDF', async () => {
    const input = await pages();
    const full = await buildScanPdf(input, { pageSize: 'a4', budgetBytes: null });
    const result = await buildScanPdf(input, { pageSize: 'a4', budgetBytes: Math.floor(full.blob.size * 0.7) });
    expect(result.quality).toBeLessThan(SCAN_QUALITY);
    for (const page of result.pages) expect(await contains(result.blob, page.blob)).toBe(true);
    // And on A4: a portrait page 595.28 x 841.89.
    const pdfPage = (await readPdf(result.blob)).getPage(0);
    expect(pdfPage.getWidth()).toBeCloseTo(595.28, 1);
    expect(pdfPage.getHeight()).toBeCloseTo(841.89, 1);
  });

  it('reports progress that only moves forward and stays under done', async () => {
    const input = await pages();
    const full = await buildScanPdf(input, { pageSize: 'fit', budgetBytes: null });
    const seen: number[] = [];
    await buildScanPdf(input, { pageSize: 'fit', budgetBytes: Math.floor(full.blob.size * 0.6), onProgress: (f) => seen.push(f) });
    expect(seen.length).toBeGreaterThan(1);
    seen.forEach((f, i) => {
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThan(1);
      if (i > 0) expect(f).toBeGreaterThan(seen[i - 1]);
    });
  });
});
