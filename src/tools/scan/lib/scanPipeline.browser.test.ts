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
import { HttpResponse } from 'msw';
import { resetErrorReportingForTests, sendBeacon, setReportingEnabledForTests } from '#lib/telemetry/errorReport.ts';
import { answerInTurn, answerNetwork } from '../../../test/support/network.browser.ts';

// The pure collaborators (warp, filters, quad maths, the budget search, imagesToPdf) are the real ones;
// the warp spy only reads the pixel quad the pipeline hands it.
vi.mock('#lib/pageEnhance/warp.ts', { spy: true });

answerNetwork();

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
  // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a browser with no module worker (older Safari), where every page is processed on the main thread
  vi.stubGlobal('Worker', undefined);
};

beforeEach(() => {
  vi.mocked(warpPerspective).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetPageWorker();
  setReportingEnabledForTests(false);
});

describe('processPage on the main thread', () => {
  beforeEach(onTheMainThread);

  it('keeps the page at quality 0.92 and a thumb of at most 480px at 0.8, frees every canvas, and releases the object URL even when the photo cannot be decoded', async () => {
    const source = await photo(1200, 900);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
    const createElement = vi.spyOn(document, 'createElement');
    const made = createObjectURL();
    const revoked = revokeObjectURL();
    const page = await processPage(source, FULL_QUAD, 'original');
    const canvases = createElement.mock.results.filter((_, i) => createElement.mock.calls[i][0] === 'canvas').map((r) => r.value as HTMLCanvasElement);
    expect(page.width).toBe(1181);
    expect(page.height).toBe(886);
    expect(toBlob.mock.calls.map(([, type, quality]) => [type, quality])).toEqual([['image/jpeg', 0.92], ['image/jpeg', 0.8]]);
    const kept = await decodedPixels(page.blob);
    const thumb = await decodedPixels(page.thumb);
    expect([kept.width, kept.height, page.blob.type]).toEqual([1181, 886, 'image/jpeg']);
    expect([thumb.width, thumb.height, page.thumb.type]).toEqual([480, 360, 'image/jpeg']);
    expect(canvases.length, 'canvases made').toBeGreaterThan(0);
    expect(canvases.every((c) => c.width === 0 && c.height === 0), 'canvases freed').toBe(true);
    expect(made).toHaveBeenCalledTimes(1);
    expect(revoked).toHaveBeenCalledTimes(1);
    await expect(processPage(new Blob(['not an image'], { type: 'image/jpeg' }), FULL_QUAD, 'original')).rejects.toMatchObject({ name: 'EncodingError' });
    expect(made).toHaveBeenCalledTimes(2);
    expect(revoked).toHaveBeenCalledTimes(2);
    expect(revoked.mock.calls).toEqual(made.mock.results.map((r) => [r.value]));
  });

  // A portrait page shot sideways: the file stores 400 x 300 with orientation 6, the browser shows it upright as 300 x 400.
  // Orientation 6 turns the stored picture a quarter clockwise, so the stored bottom half becomes the upright left half.
  const sideways = async (pixel: (x: number, y: number) => Rgb = () => GRAY) => {
    const stored = await encoded(canvasOf(400, 300, pixel), 'image/jpeg', 1);
    return new Blob([withOrientation6(new Uint8Array(await stored.arrayBuffer())) as BlobPart], { type: 'image/jpeg' });
  };

  it('works on the upright photo, so corners set on the preview land on the same pixels, and reports the upright size and a preview in that orientation', async () => {
    // Left half of the upright photo is dark, right half light.
    const upright = await sideways((_, y) => (y >= 150 ? [40, 40, 40] : [220, 220, 220]));
    const page = await processPage(upright, FULL_QUAD, 'original');
    const src = vi.mocked(warpPerspective).mock.calls[0][0];
    expect([src.width, src.height]).toEqual([300, 400]);
    expect(page.width).toBeLessThan(page.height);
    const pixels = await decodedPixels(page.blob);
    expect(Math.abs(pixels.at(10, 100)[0] - 40)).toBeLessThanOrEqual(2 * JPEG_STAGE_TOLERANCE);
    expect(Math.abs(pixels.at(page.width - 10, 100)[0] - 220)).toBeLessThanOrEqual(2 * JPEG_STAGE_TOLERANCE);
    const inspected = await inspectPhoto(upright);
    expect([inspected.width, inspected.height], 'inspected size').toEqual([300, 400]);
    const preview = await decodedPixels(inspected.preview);
    expect([preview.width, preview.height], 'inspected preview').toEqual([300, 400]);
  });
});

describe('a page worker that is sent a process job', () => {
  beforeEach(() => {
    vi.doUnmock('#lib/pageEnhance/warp.ts');
  });

  // Protects: the worker is told whether the person turned Fine-tune edges on, and it is off unless said.
  it('carries the page\'s pins and fine in the job, none and off unless told otherwise', async () => {
    const posted = vi.spyOn(Worker.prototype, 'postMessage');
    const source = await photo(400, 300);
    const pins = [[{ k: 7, at: { x: 0.5, y: 0.1 } }], [], [], []] as Pins;
    await processPage(source, q(0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9), 'original', true, pins, true);
    await processPage(source, FULL_QUAD, 'original');
    const sent = posted.mock.calls.map(([request]) => (request as { job: { kind: string; pins?: unknown; fine?: unknown } }).job).filter((job) => job.kind === 'process');
    expect(sent.map((job) => job.pins), 'pins in the job').toEqual([pins, null]);
    expect(sent.map((job) => job.fine), 'fine in the job').toEqual([true, false]);
  });
});

describe('a page worker that dies mid-job', () => {
  // The worker answers its probe, then dies on the first real job: the job finishes on the main thread.
  class DyingWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: { preventDefault(): void }) => void) | null = null;
    terminate() {}
    postMessage(request: { id: number; job: { kind: string } }) {
      setTimeout(() => {
        if (request.job.kind === 'probe') this.onmessage?.({ data: { id: request.id, ok: true, value: true } });
        else this.onerror?.({ preventDefault: () => {} });
      });
    }
  }

  it('finishes the job on the real main-thread path, and reports the worker failure once', async () => {
    resetPageWorker();
    setReportingEnabledForTests(true);
    resetErrorReportingForTests();
    const reports = answerInTurn('post', '/api/report', ...Array.from({ length: 3 }, () => () => new HttpResponse(null, { status: 204 })));
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a worker that answers its probe, then crashes on the first job
    vi.stubGlobal('Worker', DyingWorker);
    const made = createObjectURL();
    const inspected = await inspectPhoto(await photo(300, 400));
    expect([inspected.width, inspected.height]).toEqual([300, 400]);
    const preview = await decodedPixels(inspected.preview);
    expect([preview.width, preview.height]).toEqual([300, 400]);
    expect(made).toHaveBeenCalled();
    await expect(inspectPhoto(await photo(200, 100))).resolves.toMatchObject({ width: 200, height: 100 });
    sendBeacon({ control: 'control_step' });
    let landed = 0;
    do await reports.arrived(++landed);
    while (!(await reports[landed - 1].clone().text()).includes('control_step'));
    expect(landed).toBe(2);
    expect(await reports[0].json()).toMatchObject({ area: 'pdf_tool_run', step: 'scan_page_worker' });
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

  it('with no limit builds once, at full scale and the default quality, hands back the very JPEGs inside the PDF, and reports progress that only moves forward and stays under done', async () => {
    const input = await pages();
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
    const full = await buildScanPdf(input, { pageSize: 'fit', budgetBytes: null });
    expect(full, 'no limit').toMatchObject({ metTarget: true, scale: 1, quality: SCAN_QUALITY });
    // One encode a page, none repeated for the result view.
    expect(toBlob.mock.calls.map(([, type, quality]) => [type, quality]), 'one encode a page').toEqual([['image/jpeg', SCAN_QUALITY], ['image/jpeg', SCAN_QUALITY]]);
    expect(full.pages, 'pages').toHaveLength(2);
    for (const page of full.pages) {
      const shown = await decodedPixels(page.blob);
      expect([shown.width, shown.height], 'shown size').toEqual([PAGE_W, PAGE_H]);
    }

    const fullA4 = await buildScanPdf(input, { pageSize: 'a4', budgetBytes: null });
    const shrunk = await buildScanPdf(input, { pageSize: 'a4', budgetBytes: Math.floor(fullA4.blob.size * 0.7) });
    expect(shrunk.quality, 'A4 quality').toBeLessThan(SCAN_QUALITY);
    for (const page of shrunk.pages) expect(await contains(shrunk.blob, page.blob), 'JPEG inside the PDF').toBe(true);
    // And on A4: a portrait page 595.28 x 841.89.
    const pdfPage = (await readPdf(shrunk.blob)).getPage(0);
    expect(pdfPage.getWidth(), 'A4 width').toBeCloseTo(595.28, 1);
    expect(pdfPage.getHeight(), 'A4 height').toBeCloseTo(841.89, 1);

    const seen: number[] = [];
    await buildScanPdf(input, { pageSize: 'fit', budgetBytes: Math.floor(full.blob.size * 0.6), onProgress: (f) => seen.push(f) });
    expect(seen.length, 'progress steps').toBeGreaterThan(1);
    seen.forEach((f) => {
      expect(f, 'progress above 0').toBeGreaterThan(0);
      expect(f, 'progress under done').toBeLessThan(1);
    });
    seen.slice(1).forEach((f, i) => expect(f, 'progress forward').toBeGreaterThan(seen[i]));
  });

  it('steps the JPEG quality down until the PDF is under the limit, then shrinks the pixels when quality alone cannot reach it, and keeps the printed size', async () => {
    const input = await pages();
    const full = await buildScanPdf(input, { pageSize: 'fit', budgetBytes: null });
    const budget = Math.floor(full.blob.size * 0.8);
    const stepped = await buildScanPdf(input, { pageSize: 'fit', budgetBytes: budget });
    expect(stepped.metTarget, 'quality step met').toBe(true);
    expect(stepped.blob.size, 'quality step size').toBeLessThanOrEqual(budget);
    expect(stepped.scale, 'quality step scale').toBe(1);
    expect(stepped.quality, 'quality below default').toBeLessThan(SCAN_QUALITY);
    expect(stepped.quality, 'quality above floor').toBeGreaterThan(0.3);
    // The pages are re-encoded at the winning quality, not left at some other step's.
    const expected = await reencoded(input[0], 1, stepped.quality);
    expect(stepped.pages.map((p) => p.blob.size), 're-encoded at the winning quality').toEqual([expected.size, expected.size]);

    const tight = Math.floor(full.blob.size * 0.1);
    const result = await buildScanPdf(input, { pageSize: 'fit', budgetBytes: tight });
    expect(result.metTarget, 'pixel shrink met').toBe(true);
    expect(result.blob.size, 'pixel shrink size').toBeLessThanOrEqual(tight);
    expect(result.scale, 'pixel shrink scale').toBeLessThan(1);
    const [first] = result.pages;
    expect(first.place.pageWidth, 'printed width').toBeCloseTo((PAGE_W * 72) / 200, 6);
    expect(first.place.pageHeight, 'printed height').toBeCloseTo((PAGE_H * 72) / 200, 6);
    const shown = await decodedPixels(first.blob);
    expect([shown.width, shown.height], 'shrunk pixels').toEqual([Math.round(PAGE_W * result.scale), Math.round(PAGE_H * result.scale)]);
    // The PDF's own page is that size too, though its JPEG has fewer pixels.
    const pdfPage = (await readPdf(result.blob)).getPage(0);
    expect(pdfPage.getWidth(), 'PDF page width').toBeCloseTo((PAGE_W * 72) / 200, 1);
    expect(pdfPage.getHeight(), 'PDF page height').toBeCloseTo((PAGE_H * 72) / 200, 1);
  });
});
