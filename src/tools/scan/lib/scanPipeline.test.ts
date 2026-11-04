import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import { FULL_QUAD, type Quad } from './quad.ts';
import { SCAN_QUALITY } from './scanBudget.ts';
import { warpPerspective } from './warp.ts';
import { buildScanPdf, inspectPhoto, processPage, type ProcessedPage } from './scanPipeline.ts';

// The pure collaborators (warp, filters, quad maths, the budget search, imagesToPdf) are the real ones;
// warpPerspective is wrapped only to read the pixel quad the pipeline hands it.
vi.mock('./warp.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./warp.ts')>();
  return { ...actual, warpPerspective: vi.fn(actual.warpPerspective) };
});

// EDGE: node has no <img>, canvas or createImageBitmap. These fakes keep real pixels (a canvas holds an
// RGBA buffer, drawImage resamples nearest-neighbour) and a JPEG "encoder" whose bytes are a valid JPEG
// header of the canvas size padded to width x height x quality / 2, so sizes move with quality and scale.
type Rgb = [number, number, number];
interface Drawable { naturalWidth: number; naturalHeight: number; pixel(x: number, y: number): Rgb }
/** A decodable image: `width` x `height` is what the browser shows (EXIF applied); `stored` is the sideways file. */
interface PhotoSpec { width: number; height: number; stored?: { width: number; height: number }; pixel?: (x: number, y: number) => Rgb; undecodable?: boolean }

const specs = new WeakMap<Blob, PhotoSpec>();
const urls = new Map<string, Blob>();
const GRAY: Rgb = [128, 128, 128];
let urlsMade = 0;
let urlsRevoked = 0;
let canvases: FakeCanvas[] = [];
let encodes: { width: number; height: number; quality: number }[] = [];

const photo = (spec: PhotoSpec) => {
  const blob = new Blob(['photo'], { type: 'image/jpeg' });
  specs.set(blob, spec);
  return blob;
};

class FakeImage implements Drawable {
  src = '';
  naturalWidth = 0;
  naturalHeight = 0;
  private spec: PhotoSpec | undefined;
  async decode() {
    const blob = urls.get(this.src);
    if (!blob) throw new Error('decode of a revoked object URL');
    const spec = specs.get(blob) as PhotoSpec;
    if (spec.undecodable) throw new Error('EncodingError');
    this.spec = spec;
    this.naturalWidth = spec.width;
    this.naturalHeight = spec.height;
  }
  pixel(x: number, y: number): Rgb { return this.spec?.pixel?.(x, y) ?? GRAY; }
}

/** createImageBitmap without EXIF handling: the file's stored, sideways pixels. */
async function fakeCreateImageBitmap(blob: Blob): Promise<Drawable & { width: number; height: number }> {
  const spec = specs.get(blob) as PhotoSpec;
  const { width, height } = spec.stored ?? spec;
  return { width, height, naturalWidth: width, naturalHeight: height, pixel: () => GRAY };
}

class FakeImageData {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}

function jpegBytes(width: number, height: number, quality: number): Uint8Array {
  const size = Math.max(32, Math.round(width * height * quality * 0.5));
  const bytes = new Uint8Array(size);
  // SOI, SOF0 (8 bit, height, width, 3 components), padding, EOI: what pdf-lib's embedJpg reads.
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  bytes.set([0xff, 0xd9], size - 2);
  return bytes;
}

class FakeCanvas implements Drawable {
  private w = 300;
  private h = 150;
  data = new Uint8ClampedArray(this.w * this.h * 4);
  get width() { return this.w; }
  set width(v: number) { this.w = v; this.data = new Uint8ClampedArray(this.w * this.h * 4); }
  get height() { return this.h; }
  set height(v: number) { this.h = v; this.data = new Uint8ClampedArray(this.w * this.h * 4); }
  get naturalWidth() { return this.w; }
  get naturalHeight() { return this.h; }
  pixel(x: number, y: number): Rgb { const i = (y * this.w + x) * 4; return [this.data[i], this.data[i + 1], this.data[i + 2]]; }
  getContext = () => ({
    fillStyle: '',
    fillRect: () => this.data.fill(255),
    drawImage: (src: Drawable, _x: number, _y: number, dw = src.naturalWidth, dh = src.naturalHeight) => {
      for (let y = 0; y < this.h; y += 1) {
        for (let x = 0; x < this.w; x += 1) {
          const sx = Math.min(src.naturalWidth - 1, Math.floor(((x + 0.5) * src.naturalWidth) / dw));
          const sy = Math.min(src.naturalHeight - 1, Math.floor(((y + 0.5) * src.naturalHeight) / dh));
          this.data.set([...src.pixel(sx, sy), 255], (y * this.w + x) * 4);
        }
      }
    },
    getImageData: () => new FakeImageData(this.data.slice(), this.w, this.h),
    putImageData: (image: FakeImageData) => this.data.set(image.data),
  });
  toBlob(done: (blob: Blob) => void, type: string, quality: number) {
    encodes.push({ width: this.w, height: this.h, quality });
    const blob = new Blob([jpegBytes(this.w, this.h, quality) as BlobPart], { type });
    const copy = this.data.slice();
    const w = this.w;
    specs.set(blob, { width: this.w, height: this.h, pixel: (x, y) => [copy[(y * w + x) * 4], copy[(y * w + x) * 4 + 1], copy[(y * w + x) * 4 + 2]] });
    done(blob);
  }
}

const createObjectURL = vi.spyOn(URL, 'createObjectURL');
const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');

beforeEach(() => {
  urls.clear();
  urlsMade = 0;
  urlsRevoked = 0;
  canvases = [];
  encodes = [];
  vi.mocked(warpPerspective).mockClear();
  createObjectURL.mockImplementation((blob) => {
    urlsMade += 1;
    const url = `blob:fake/${urlsMade}`;
    urls.set(url, blob as Blob);
    return url;
  });
  revokeObjectURL.mockImplementation((url) => {
    urlsRevoked += 1;
    urls.delete(url);
  });
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('ImageData', FakeImageData);
  vi.stubGlobal('createImageBitmap', fakeCreateImageBitmap);
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const q = (...c: number[]): Quad => [{ x: c[0], y: c[1] }, { x: c[2], y: c[3] }, { x: c[4], y: c[5] }, { x: c[6], y: c[7] }];
/** The processed page's pixels, as the output canvas held them when it was encoded (the JPEG the PDF is built from). */
const pagePixels = async (page: ProcessedPage) => {
  const spec = specs.get(page.blob) as PhotoSpec;
  const out: Rgb[] = [];
  for (let y = 0; y < page.height; y += 1) for (let x = 0; x < page.width; x += 1) out.push((spec.pixel as NonNullable<PhotoSpec['pixel']>)(x, y));
  return out;
};

describe('processPage: the inset crop', () => {
  // A 2px dark table border around mid-gray paper: the sliver the edge guess can leave inside its corners.
  const bordered = (width: number, height: number) => photo({
    width,
    height,
    pixel: (x, y) => (x < 2 || y < 2 || x >= width - 2 || y >= height - 2 ? [0, 0, 0] : GRAY),
  });

  it('crops 1.6% in from the corners, so the page outline never shows as a dark edge line', async () => {
    const page = await processPage(bordered(400, 300), FULL_QUAD, 'original');
    const pixels = await pagePixels(page);
    expect(pixels).toHaveLength(page.width * page.height);
    // Every output pixel is paper: the border (and the white past the photo's edge) is cropped away.
    expect(pixels.every(([r, g, b]) => r === 128 && g === 128 && b === 128)).toBe(true);
  });

  it('warps exactly the inset corners, in photo pixels, and sizes the page from them', async () => {
    const page = await processPage(photo({ width: 400, height: 300 }), q(0.1, 0.2, 0.9, 0.1, 0.8, 0.9, 0.2, 0.8), 'original');
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
    expect([page.width, page.height]).toEqual([316, 239]);
  });
});

describe('processPage: the JPEGs it keeps', () => {
  it('keeps the page at quality 0.92 and a thumb of at most 480px at 0.8', async () => {
    const page = await processPage(photo({ width: 1200, height: 900 }), FULL_QUAD, 'original');
    expect(page.width).toBe(1181);
    expect(page.height).toBe(886);
    expect(encodes).toEqual([
      { width: 1181, height: 886, quality: 0.92 },
      { width: 480, height: 360, quality: 0.8 },
    ]);
    expect(specs.get(page.thumb)).toMatchObject({ width: 480, height: 360 });
  });

  it('frees every canvas it made', async () => {
    await processPage(photo({ width: 400, height: 300 }), FULL_QUAD, 'original');
    expect(canvases.length).toBeGreaterThan(0);
    expect(canvases.every((c) => c.width === 0 && c.height === 0)).toBe(true);
  });
});

describe('the EXIF-aligned load', () => {
  // A portrait page shot sideways: the file stores 400 x 300, the browser shows it upright as 300 x 400.
  const sideways = (extra: Partial<PhotoSpec> = {}) => photo({ width: 300, height: 400, stored: { width: 400, height: 300 }, ...extra });

  it('works on the upright photo, so corners set on the preview land on the same pixels', async () => {
    // Left half of the upright photo is dark, right half light.
    const page = await processPage(sideways({ pixel: (x) => (x < 150 ? [40, 40, 40] : [220, 220, 220]) }), FULL_QUAD, 'original');
    const src = vi.mocked(warpPerspective).mock.calls[0][0];
    expect([src.width, src.height]).toEqual([300, 400]);
    expect(page.width).toBeLessThan(page.height);
    const pixels = await pagePixels(page);
    expect(pixels[page.width * 100 + 10][0]).toBe(40);
    expect(pixels[page.width * 100 + page.width - 10][0]).toBe(220);
  });

  it('reports the upright size and a preview in that orientation', async () => {
    const inspected = await inspectPhoto(sideways());
    expect([inspected.width, inspected.height]).toEqual([300, 400]);
    expect(specs.get(inspected.preview)).toMatchObject({ width: 300, height: 400 });
  });

  it('releases the object URL after decoding, even when the photo cannot be decoded', async () => {
    await processPage(photo({ width: 400, height: 300 }), FULL_QUAD, 'original');
    expect(urlsMade).toBe(1);
    expect(urlsRevoked).toBe(1);
    await expect(processPage(photo({ width: 400, height: 300, undecodable: true }), FULL_QUAD, 'original')).rejects.toThrow('EncodingError');
    expect(urlsRevoked).toBe(urlsMade);
  });
});

describe('buildScanPdf: the size limit', () => {
  const PAGE_W = 500;
  const PAGE_H = 700;
  const pages = (): ProcessedPage[] => [0, 1].map(() => {
    const blob = photo({ width: PAGE_W, height: PAGE_H });
    return { blob, width: PAGE_W, height: PAGE_H, thumb: blob, bentPx: 0 };
  });
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

  it('with no limit builds once, at full scale and the default quality', async () => {
    const result = await buildScanPdf(pages(), { pageSize: 'fit', budgetBytes: null });
    expect(result).toMatchObject({ metTarget: true, scale: 1, quality: SCAN_QUALITY });
    // One encode a page, none repeated for the result view.
    expect(encodes).toEqual([
      { width: PAGE_W, height: PAGE_H, quality: SCAN_QUALITY },
      { width: PAGE_W, height: PAGE_H, quality: SCAN_QUALITY },
    ]);
    expect(result.pages).toHaveLength(2);
  });

  it('steps the JPEG quality down until the PDF is under the limit', async () => {
    // Two pages are 288 KB at the default quality; the limit sits well below that and above the 0.3 floor.
    const budget = 160_000;
    const result = await buildScanPdf(pages(), { pageSize: 'fit', budgetBytes: budget });
    expect(result.metTarget).toBe(true);
    expect(result.blob.size).toBeLessThanOrEqual(budget);
    expect(result.scale).toBe(1);
    expect(result.quality).toBeLessThan(SCAN_QUALITY);
    // The pages are re-encoded at the winning quality, not left at some other step's.
    expect(result.pages.map((p) => p.blob.size)).toEqual([jpegBytes(PAGE_W, PAGE_H, result.quality).length, jpegBytes(PAGE_W, PAGE_H, result.quality).length]);
  });

  it('shrinks the pixels when quality alone cannot reach the limit, and keeps the printed size', async () => {
    const result = await buildScanPdf(pages(), { pageSize: 'fit', budgetBytes: 40_000 });
    expect(result.metTarget).toBe(true);
    expect(result.blob.size).toBeLessThanOrEqual(40_000);
    expect(result.scale).toBeLessThan(1);
    const [first] = result.pages;
    expect(first.place.pageWidth).toBeCloseTo((PAGE_W * 72) / 200, 6);
    expect(first.place.pageHeight).toBeCloseTo((PAGE_H * 72) / 200, 6);
    // The PDF's own page is that size too, though its JPEG has fewer pixels.
    const pdfPage = (await readPdf(result.blob)).getPage(0);
    expect(pdfPage.getWidth()).toBeCloseTo((PAGE_W * 72) / 200, 1);
    expect(pdfPage.getHeight()).toBeCloseTo((PAGE_H * 72) / 200, 1);
  });

  it('hands back the very JPEGs that sit inside the PDF', async () => {
    // At this limit the search's last build is not the one that wins, so the pages shown are encoded again.
    const result = await buildScanPdf(pages(), { pageSize: 'a4', budgetBytes: 200_000 });
    expect(result.quality).toBeLessThan(SCAN_QUALITY);
    for (const page of result.pages) expect(await contains(result.blob, page.blob)).toBe(true);
    // And on A4: a portrait page 595.28 x 841.89.
    const pdfPage = (await readPdf(result.blob)).getPage(0);
    expect(pdfPage.getWidth()).toBeCloseTo(595.28, 1);
    expect(pdfPage.getHeight()).toBeCloseTo(841.89, 1);
  });

  it('reports progress that only moves forward and stays under done', async () => {
    const seen: number[] = [];
    await buildScanPdf(pages(), { pageSize: 'fit', budgetBytes: 150_000, onProgress: (f) => seen.push(f) });
    expect(seen.length).toBeGreaterThan(1);
    seen.forEach((f, i) => {
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThan(1);
      if (i > 0) expect(f).toBeGreaterThan(seen[i - 1]);
    });
  });
});
