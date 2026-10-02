import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName, PDFString } from '@cantoo/pdf-lib';
import { analyzePdf } from './analyzePdf.js';
import {
  compressPdfImages,
  compressPdfImagesToTarget,
  IMAGE_LEVELS,
  planImageRewrite,
  TARGET_IMAGE_LADDER,
  targetDimensions,
} from './compressImages.js';

const JPEG_1X1_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const jpeg1x1 = () => Uint8Array.from(atob(JPEG_1X1_BASE64), (c) => c.charCodeAt(0));

const fixture = (name) =>
  new File([readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url))], name, {
    type: 'application/pdf',
  });

const base = {
  isMask: false,
  hasSMask: false,
  bitsPerComponent: 8,
  colorSpace: 'DeviceRGB',
  filters: ['DCTDecode'],
  width: 100,
  height: 100,
  predictor: null,
  hasDecode: false,
};

const fakeEncoder = vi.fn(async () => jpeg1x1());

async function analyze(blob) {
  const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), { updateMetadata: false });
  return { doc, report: analyzePdf(doc, { totalBytes: blob.size }) };
}

describe('planImageRewrite', () => {
  const opts = { maxLongSidePx: 1000 };
  it('re-encodes DCT and Flate RGB/Gray images', () => {
    expect(planImageRewrite(base)).toBe('reencode');
    expect(planImageRewrite({ ...base, filters: ['FlateDecode'] })).toBe('reencode');
    expect(planImageRewrite({ ...base, colorSpace: 'DeviceGray' })).toBe('reencode');
  });
  it('keeps each unsupported case', () => {
    expect(planImageRewrite({ ...base, isMask: true })).toBe('keep');
    expect(planImageRewrite({ ...base, hasSMask: true })).toBe('keep');
    expect(planImageRewrite({ ...base, bitsPerComponent: 1 })).toBe('keep');
    expect(planImageRewrite({ ...base, colorSpace: 'ICCBased' })).toBe('keep');
    expect(planImageRewrite({ ...base, filters: ['JPXDecode'] })).toBe('keep');
    expect(planImageRewrite({ ...base, filters: ['FlateDecode', 'DCTDecode'] })).toBe('keep');
    expect(planImageRewrite({ ...base, width: 60, height: 60 })).toBe('keep');
    // pdf-lib's Flate decoder ignores /DecodeParms, so a PNG-predicted image
    // would decode sheared; a /Decode array would be dropped un-applied.
    expect(planImageRewrite({ ...base, filters: ['FlateDecode'], predictor: 15 })).toBe('keep');
    expect(planImageRewrite({ ...base, hasDecode: true })).toBe('keep');
  });
});

describe('targetDimensions', () => {
  it('downscales the long side, landscape and portrait', () => {
    expect(targetDimensions(2000, 1500, 1000)).toEqual({ width: 1000, height: 750 });
    expect(targetDimensions(1500, 2000, 1000)).toEqual({ width: 750, height: 1000 });
  });
  it('never upscales', () => {
    expect(targetDimensions(800, 600, 1000)).toEqual({ width: 800, height: 600 });
  });
  it('is at least 1 and integer', () => {
    expect(targetDimensions(10000, 1, 100)).toEqual({ width: 100, height: 1 });
    expect(Number.isInteger(targetDimensions(999, 777, 500).height)).toBe(true);
  });
});

describe('compressPdfImages', () => {
  it('rewrites the photos of mixed.pdf and leaves the page alone', async () => {
    const file = fixture('mixed.pdf');
    const result = await compressPdfImages(file, {
      maxLongSidePx: 1000,
      quality: 0.7,
      encodeImage: fakeEncoder,
    });
    expect(result.reason).toBe('smaller');
    expect(result.blob).not.toBe(file);
    expect(result.rewritten).toBe(2);
    expect(result.beforeBytes).toBe(file.size);
    expect(result.afterBytes).toBe(result.blob.size);
    console.log(`mixed.pdf: ${result.beforeBytes} -> ${result.afterBytes} bytes`);

    const { doc, report } = await analyze(result.blob);
    expect(report.hasText).toBe(true);
    expect(report.images).toHaveLength(4);
    expect(report.pageCount).toBe(1);
    const rewritten = report.images.filter((i) => i.filters[0] === 'DCTDecode' && (i.width === 1000 || i.width === 800));
    // The dict carries the target size; the fake's JPEG body is 1x1.
    expect(rewritten.map((i) => [i.width, i.height]).sort()).toEqual([[1000, 750], [800, 600]]);
    expect(report.images.filter((i) => i.hasSMask)).toHaveLength(1);

    const annots = doc.getPage(0).node.Annots();
    expect(annots.size()).toBe(1);
    const annot = doc.context.lookup(annots.get(0));
    const action = doc.context.lookup(annot.get(PDFName.of('A')));
    expect(String(action.get(PDFName.of('URI')) instanceof PDFString ? action.get(PDFName.of('URI')).decodeText() : '')).toBe('https://example.com/');
  });

  it('rewrites both scan pages', async () => {
    const result = await compressPdfImages(fixture('scan.pdf'), {
      maxLongSidePx: 1000,
      quality: 0.7,
      encodeImage: fakeEncoder,
    });
    expect(result.reason).toBe('smaller');
    expect(result.rewritten).toBe(2);
    expect((await analyze(result.blob)).report.pageCount).toBe(2);
  });

  it('hands back a text-only file untouched', async () => {
    const file = fixture('text-only.pdf');
    const result = await compressPdfImages(file, { maxLongSidePx: 1000, quality: 0.7, encodeImage: fakeEncoder });
    expect(result.reason).toBe('no-images');
    expect(result.blob).toBe(file);
    expect(result.rewritten).toBe(0);
  });

  it('replaces nothing when the encoder returns more bytes', async () => {
    const file = fixture('mixed.pdf');
    const big = vi.fn(async ({ image }) => new Uint8Array(image.bytes + 10));
    const result = await compressPdfImages(file, { maxLongSidePx: 1000, quality: 0.7, encodeImage: big });
    expect(result.rewritten).toBe(0);
    expect(big).toHaveBeenCalled();
    if (result.reason === 'no-gain') expect(result.blob).toBe(file);
  });

  it('keeps an image the encoder cannot decode', async () => {
    const file = fixture('mixed.pdf');
    const result = await compressPdfImages(file, {
      maxLongSidePx: 1000,
      quality: 0.7,
      encodeImage: async () => null,
    });
    expect(result.rewritten).toBe(0);
    expect(result.blob).toBe(file);
  });

  it('passes the target from targetDimensions', async () => {
    const encode = vi.fn(async () => jpeg1x1());
    await compressPdfImages(fixture('mixed.pdf'), { maxLongSidePx: 1000, quality: 0.7, encodeImage: encode });
    const call = encode.mock.calls.map(([arg]) => arg).find((arg) => arg.image.width === 2000);
    expect(call.target).toEqual({ width: 1000, height: 750 });
  });
});

describe('IMAGE_LEVELS', () => {
  it('has the three levels the cards quote', () => {
    expect(IMAGE_LEVELS).toEqual({
      high: { maxLongSidePx: 1000, quality: 0.4 },
      medium: { maxLongSidePx: 1600, quality: 0.6 },
      low: { maxLongSidePx: 2400, quality: 0.8 },
    });
  });
});

describe('compressPdfImagesToTarget', () => {
  // Output size follows the target width, so each rung is smaller than the last.
  // Any Uint8Array works: the rewrite never parses the JPEG body.
  const sized = () => vi.fn(async ({ target }) => new Uint8Array(target.width * 5));
  const afterBytesAt = async (rung) =>
    (await compressPdfImages(fixture('mixed.pdf'), { ...rung, encodeImage: sized() })).afterBytes;

  it('hands back a file already under target without loading it', async () => {
    const file = fixture('mixed.pdf');
    const encode = sized();
    const result = await compressPdfImagesToTarget(file, { targetKB: file.size, encodeImage: encode });
    expect(result.reason).toBe('under-target');
    expect(result.metTarget).toBe(true);
    expect(result.blob).toBe(file);
    expect(encode).not.toHaveBeenCalled();
  });

  it('stops at once when there are no images', async () => {
    const file = fixture('text-only.pdf');
    const encode = sized();
    const result = await compressPdfImagesToTarget(file, { targetKB: 1, encodeImage: encode });
    expect(result.reason).toBe('no-images');
    expect(result.metTarget).toBe(false);
    expect(result.blob).toBe(file);
    expect(encode).not.toHaveBeenCalled();
  });

  it('takes the first rung that meets the target', async () => {
    const third = await afterBytesAt(TARGET_IMAGE_LADDER[2]);
    const second = await afterBytesAt(TARGET_IMAGE_LADDER[1]);
    expect(third).toBeLessThan(second);
    const encode = sized();
    const result = await compressPdfImagesToTarget(fixture('mixed.pdf'), {
      targetKB: third / 1024,
      encodeImage: encode,
    });
    expect(result.metTarget).toBe(true);
    expect(result.reason).toBe('smaller');
    expect(result.afterBytes).toBe(third);
    const widths = encode.mock.calls.map(([arg]) => arg.target.width).filter((w) => w !== 800);
    expect(widths).toEqual([2000, 1600, 1000]);
  });

  it('returns the smallest result when nothing meets the target', async () => {
    const smallest = await afterBytesAt(TARGET_IMAGE_LADDER[TARGET_IMAGE_LADDER.length - 1]);
    const result = await compressPdfImagesToTarget(fixture('mixed.pdf'), { targetKB: 1, encodeImage: sized() });
    expect(result.metTarget).toBe(false);
    expect(result.reason).toBe('smaller');
    expect(result.afterBytes).toBe(smallest);
  });

  it('reports no-gain when the encoder never helps', async () => {
    const file = fixture('mixed.pdf');
    const result = await compressPdfImagesToTarget(file, { targetKB: 1, encodeImage: async () => null });
    expect(result.reason).toBe('no-gain');
    expect(result.metTarget).toBe(false);
    expect(result.blob).toBe(file);
    expect(result.afterBytes).toBe(file.size);
  });

  it('reports progress that ends at 1 and never goes back', async () => {
    const seen = [];
    await compressPdfImagesToTarget(fixture('mixed.pdf'), {
      targetKB: 1,
      encodeImage: sized(),
      onProgress: (p) => seen.push(p),
    });
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((p, i) => i === 0 || p >= seen[i - 1])).toBe(true);
  });
});
