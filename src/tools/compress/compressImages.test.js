import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName, PDFRef, PDFString } from '@cantoo/pdf-lib';
import { analyzePdf } from './analyzePdf.js';
import { permissionsFromP } from './pdfPermissions.js';
import {
  compressPdfImages,
  compressPdfImagesToTarget,
  IMAGE_LEVELS,
  lerpRung,
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
  components: 3,
  smaskHasMatte: false,
  hasColorKeyMask: false,
};

const fakeEncoder = vi.fn(async () => jpeg1x1());
// Smaller than any fixture image, even the flat-colour 200x200 one (the rewrite never parses the body).
const tinyEncoder = async () => new Uint8Array(16);

async function analyze(blob) {
  const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), { updateMetadata: false });
  return { doc, report: analyzePdf(doc, { totalBytes: blob.size }) };
}

describe('planImageRewrite', () => {
  const opts = { maxLongSidePx: 1000 };
  it('re-encodes DCT and Flate RGB/Gray images', () => {
    expect(planImageRewrite(base)).toBe('reencode');
    expect(planImageRewrite({ ...base, filters: ['FlateDecode'] })).toBe('reencode');
    expect(planImageRewrite({ ...base, colorSpace: 'DeviceGray', components: 1 })).toBe('reencode');
  });
  it('re-encodes ICCBased 1 and 3 component images, and images with a plain SMask', () => {
    expect(planImageRewrite({ ...base, colorSpace: 'ICCBased', components: 3 })).toBe('reencode');
    expect(planImageRewrite({ ...base, colorSpace: 'ICCBased', components: 1 })).toBe('reencode');
    expect(planImageRewrite({ ...base, hasSMask: true })).toBe('reencode');
  });
  it('keeps each unsupported case', () => {
    // After JPEG re-encoding the pixels no longer match the key, so the transparency would speckle.
    expect(planImageRewrite({ ...base, hasColorKeyMask: true })).toBe('keep');
    expect(planImageRewrite({ ...base, isMask: true })).toBe('keep');
    expect(planImageRewrite({ ...base, bitsPerComponent: 1 })).toBe('keep');
    expect(planImageRewrite({ ...base, colorSpace: 'ICCBased', components: 4 })).toBe('keep');
    expect(planImageRewrite({ ...base, colorSpace: 'Indexed', components: null })).toBe('keep');
    expect(planImageRewrite({ ...base, colorSpace: 'DeviceCMYK', components: null })).toBe('keep');
    expect(planImageRewrite({ ...base, smaskHasMatte: true, hasSMask: true })).toBe('keep');
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

// A PDF whose only image is 1x1, so it is planned 'keep'.
async function tinyImagePdf() {
  const doc = await PDFDocument.create();
  doc.addPage().drawImage(await doc.embedJpg(jpeg1x1()), { x: 0, y: 0, width: 10, height: 10 });
  return new File([await doc.save()], 'tiny.pdf', { type: 'application/pdf' });
}

describe('compressPdfImages', () => {
  it("reports 'unsupported' when every image is kept, without encoding", async () => {
    const file = await tinyImagePdf();
    const encode = vi.fn(async () => null);
    const result = await compressPdfImages(file, { maxLongSidePx: 1000, quality: 0.7, encodeImage: encode });
    expect(result.reason).toBe('unsupported');
    expect(result.blob).toBe(file);
    expect(encode).not.toHaveBeenCalled();
  });

  it("keeps 'no-gain' for images that were tried", async () => {
    const result = await compressPdfImages(fixture('mixed.pdf'), {
      maxLongSidePx: 1000, quality: 0.7, encodeImage: async () => null,
    });
    expect(result.reason).toBe('no-gain');
  });

  it('does not save or run text detection when nothing is rewritten', async () => {
    const save = vi.spyOn(PDFDocument.prototype, 'save');
    const getPages = vi.spyOn(PDFDocument.prototype, 'getPages');
    try {
      await compressPdfImages(fixture('mixed.pdf'), { maxLongSidePx: 1000, quality: 0.7, encodeImage: async () => null });
      expect(save).not.toHaveBeenCalled();
      // detectText walks the pages' content streams; image collection never does.
      expect(getPages).not.toHaveBeenCalled();
    } finally {
      save.mockRestore();
      getPages.mockRestore();
    }
  });
  it('reports the bytes of the images it left as they were', async () => {
    const file = fixture('mixed.pdf');
    const before = (await analyze(file)).report.images;
    const result = await compressPdfImages(file, { maxLongSidePx: 1000, quality: 0.7, encodeImage: tinyEncoder });
    expect(result.rewritten).toBe(3);
    const kept = before.filter((image) => planImageRewrite(image) !== 'reencode');
    expect(kept).toHaveLength(1);
    expect(result.keptBytes).toBe(kept[0].bytes);
    const none = await compressPdfImages(file, { maxLongSidePx: 1000, quality: 0.7, encodeImage: async () => null });
    expect(none.keptBytes).toBe(before.reduce((sum, image) => sum + image.bytes, 0));
  });

  it('does not count an image that was re-encoded but came out no smaller as kept', async () => {
    const file = fixture('mixed.pdf');
    const big = async ({ image }) => new Uint8Array(image.bytes + 10);
    const result = await compressPdfImages(file, { maxLongSidePx: 1000, quality: 0.7, encodeImage: big });
    const before = (await analyze(file)).report.images;
    expect(result.keptBytes).toBe(before.filter((image) => planImageRewrite(image) !== 'reencode').reduce((sum, image) => sum + image.bytes, 0));
    expect(result.imageBytes).toBe(before.reduce((sum, image) => sum + image.bytes, 0));
  });

  it('rewrites the photos of mixed.pdf and leaves the page alone', async () => {
    const file = fixture('mixed.pdf');
    const result = await compressPdfImages(file, {
      maxLongSidePx: 1000,
      quality: 0.7,
      encodeImage: tinyEncoder,
    });
    expect(result.reason).toBe('smaller');
    expect(result.blob).not.toBe(file);
    expect(result.rewritten).toBe(3);
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

    // The transparent image is re-encoded, but its mask stream is the same, untouched one.
    const before = (await analyze(file)).report.images;
    const smaskOf = (d, img) => d.context.lookup(PDFRef.of(...img.ref.split(' ').map(Number))).dict.get(PDFName.of('SMask'));
    const beforeDoc = (await analyze(file)).doc;
    const transBefore = before.find((i) => i.hasSMask);
    const transAfter = report.images.find((i) => i.hasSMask);
    expect(transAfter.filters).toEqual(['DCTDecode']);
    const maskRef = smaskOf(beforeDoc, transBefore);
    expect(smaskOf(doc, transAfter).toString()).toBe(maskRef.toString());
    const maskBefore = before.find((i) => i.ref === maskRef.toString());
    const maskAfter = report.images.find((i) => i.ref === maskRef.toString());
    expect(maskAfter.isMask).toBe(true);
    expect(maskAfter.filters).toEqual(maskBefore.filters);
    expect(maskAfter.bytes).toBe(maskBefore.bytes);

    const annots = doc.getPage(0).node.Annots();
    expect(annots.size()).toBe(1);
    const annot = doc.context.lookup(annots.get(0));
    const action = doc.context.lookup(annot.get(PDFName.of('A')));
    expect(String(action.get(PDFName.of('URI')) instanceof PDFString ? action.get(PDFName.of('URI')).decodeText() : '')).toBe('https://example.com/');
  });

  describe('colour spaces and masks', () => {
    // Loads a fixture, lets `edit(doc, images)` change it, and hands back a real file.
    const edited = async (name, edit) => {
      const { doc, report } = await analyze(fixture(name));
      const ref = (img) => PDFRef.of(...img.ref.split(' ').map(Number));
      await edit(doc, report.images, ref);
      const bytes = await doc.save({ useObjectStreams: false });
      return new File([bytes], name, { type: 'application/pdf' });
    };
    const setIcc = (doc, dict, n) => {
      const icc = doc.context.register(doc.context.stream(new Uint8Array(4), { N: n }));
      const cs = doc.context.obj([PDFName.of('ICCBased'), icc]);
      dict.set(PDFName.of('ColorSpace'), cs);
      return icc.toString();
    };
    const run = (file) => compressPdfImages(file, { maxLongSidePx: 1000, quality: 0.7, encodeImage: tinyEncoder });

    it('re-encodes an ICCBased RGB image and keeps its profile', async () => {
      let iccRef;
      const file = await edited('mixed.pdf', (doc, images, ref) => {
        iccRef = setIcc(doc, doc.context.lookup(ref(images[1])).dict, 3);
      });
      const result = await run(file);
      expect(result.rewritten).toBe(3);
      const { doc, report } = await analyze(result.blob);
      const flate = report.images.find((i) => i.width === 800);
      expect(flate.filters).toEqual(['DCTDecode']);
      expect(flate.colorSpace).toBe('ICCBased');
      expect(flate.components).toBe(3);
      const cs = doc.context.lookup(PDFRef.of(...flate.ref.split(' ').map(Number))).dict.get(PDFName.of('ColorSpace'));
      expect(doc.context.lookup(cs).get(1).toString()).toBe(iccRef);
    });

    it('re-encodes an ICCBased gray image as DeviceRGB', async () => {
      const file = await edited('scan.pdf', (doc, images, ref) => {
        setIcc(doc, doc.context.lookup(ref(images[0])).dict, 1);
      });
      const result = await run(file);
      expect(result.rewritten).toBe(2);
      const { report } = await analyze(result.blob);
      expect(report.images.every((i) => i.colorSpace === 'DeviceRGB' && i.components === 3)).toBe(true);
    });

    it('leaves an image alone when its SMask has a /Matte', async () => {
      const file = await edited('mixed.pdf', (doc, images, ref) => {
        const trans = images.find((i) => i.hasSMask);
        const smask = doc.context.lookup(doc.context.lookup(ref(trans)).dict.get(PDFName.of('SMask')));
        smask.dict.set(PDFName.of('Matte'), doc.context.obj([0, 0, 0]));
      });
      const result = await run(file);
      expect(result.rewritten).toBe(2);
      const { report } = await analyze(result.blob);
      expect(report.images.find((i) => i.hasSMask).filters).toEqual(['FlateDecode']);
    });
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

  it("stops at once when every image is unsupported", async () => {
    const file = await tinyImagePdf();
    const encode = sized();
    const result = await compressPdfImagesToTarget(file, { targetKB: 0.001, encodeImage: encode });
    expect(result.reason).toBe('unsupported');
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
    const widths = encode.mock.calls.map(([arg]) => arg.target.width).filter((w) => w !== 800 && w !== 200);
    // The walk stops at the third rung; bisection calls follow it.
    expect(widths.slice(0, 3)).toEqual([2000, 1600, 1000]);
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

describe('compressPdfImagesToTarget bisection between rungs', () => {
  // Bytes grow with both the target width and the quality.
  const sizedQ = () =>
    vi.fn(async ({ target, quality }) => new Uint8Array(Math.round(target.width * 5 * (1 + quality))));
  const afterBytesAt = async (rung) =>
    (await compressPdfImages(fixture('mixed.pdf'), { ...rung, encodeImage: sizedQ() })).afterBytes;
  const between = async () => {
    const over = await afterBytesAt(TARGET_IMAGE_LADDER[1]);
    const under = await afterBytesAt(TARGET_IMAGE_LADDER[2]);
    expect(under).toBeLessThan(over);
    return { over, under, targetBytes: Math.round((over + under) / 2) };
  };

  it('uses more of the budget than the lower rung when the target falls between rungs', async () => {
    const { under, targetBytes } = await between();
    const result = await compressPdfImagesToTarget(fixture('mixed.pdf'), {
      targetKB: targetBytes / 1024,
      encodeImage: sizedQ(),
    });
    expect(result.metTarget).toBe(true);
    expect(result.reason).toBe('smaller');
    expect(result.afterBytes).toBeLessThanOrEqual(targetBytes);
    expect(result.afterBytes).toBeGreaterThan(under);
  });

  it('does not bisect when the best rung already fits', async () => {
    const file = fixture('mixed.pdf');
    const best = await afterBytesAt(TARGET_IMAGE_LADDER[0]);
    const encode = sizedQ();
    const result = await compressPdfImagesToTarget(file, { targetKB: best / 1024, encodeImage: encode });
    expect(result.metTarget).toBe(true);
    expect(result.afterBytes).toBe(best);
    const single = sizedQ();
    await compressPdfImages(file, { ...TARGET_IMAGE_LADDER[0], encodeImage: single });
    expect(encode.mock.calls.length).toBe(single.mock.calls.length);
  });

  it('reports non-decreasing progress ending at 1 on the bisect path', async () => {
    const { targetBytes } = await between();
    const seen = [];
    await compressPdfImagesToTarget(fixture('mixed.pdf'), {
      targetKB: targetBytes / 1024,
      encodeImage: sizedQ(),
      onProgress: (p) => seen.push(p),
    });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((p, i) => i === 0 || p >= seen[i - 1])).toBe(true);
  });
});

describe('lerpRung', () => {
  const a = { maxLongSidePx: 1600, quality: 0.6 };
  const b = { maxLongSidePx: 1000, quality: 0.4 };
  it('interpolates size and quality', () => {
    expect(lerpRung(a, b, 0)).toEqual(a);
    expect(lerpRung(a, b, 0.5)).toEqual({ maxLongSidePx: 1300, quality: 0.5 });
    expect(lerpRung(a, b, 1)).toEqual(b);
  });
});

describe('compressPdfImages on encrypted files', () => {
  const perms = {
    printing: 'highResolution',
    copying: false,
    modifying: false,
    annotating: false,
    fillingForms: false,
    contentAccessibility: true,
    documentAssembly: false,
  };
  const encryptedScan = async (userPassword) => {
    const doc = await PDFDocument.load(readFileSync(new URL('./__fixtures__/scan.pdf', import.meta.url)));
    doc.encrypt({ userPassword, ownerPassword: 'x', permissions: perms });
    return new File([await doc.save()], 'enc.pdf', { type: 'application/pdf' });
  };
  const opts = (encodeImage) => ({ maxLongSidePx: 1000, quality: 0.7, encodeImage });

  it('compresses an owner-only file and re-applies its permissions', async () => {
    const result = await compressPdfImages(await encryptedScan(''), opts(fakeEncoder));
    expect(result.reason).toBe('smaller');
    expect(result.rewritten).toBe(2);
    const out = new Uint8Array(await result.blob.arrayBuffer());
    await expect(PDFDocument.load(out, { updateMetadata: false })).rejects.toThrow(/encrypted/i);
    await PDFDocument.load(out, { password: '', updateMetadata: false });
    // Decrypting drops /Encrypt from the trailer, so read the raw dict.
    const raw = await PDFDocument.load(out, { ignoreEncryption: true, updateMetadata: false });
    const enc = raw.context.lookup(raw.context.trailerInfo.Encrypt);
    expect(permissionsFromP(enc.get(PDFName.of('P')).asNumber())).toEqual(perms);
  });

  it('hands back a file that needs a password untouched', async () => {
    const file = await encryptedScan('secret');
    const encoder = vi.fn(async () => jpeg1x1());
    const result = await compressPdfImages(file, opts(encoder));
    expect(result.reason).toBe('encrypted');
    expect(result.blob).toBe(file);
    expect(encoder).not.toHaveBeenCalled();
  });

  it.each([
    ['a public-key handler', (enc) => enc.set(PDFName.of('Filter'), PDFName.of('Adobe.PubSec'))],
    ['an Encrypt dict with no /P', (enc) => enc.delete(PDFName.of('P'))],
  ])('hands back %s untouched, without throwing', async (_, edit) => {
    const raw = await PDFDocument.load(new Uint8Array(await (await encryptedScan('')).arrayBuffer()), {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    edit(raw.context.lookup(raw.context.trailerInfo.Encrypt));
    const file = new File([await raw.save({ useObjectStreams: false })], 'odd.pdf', { type: 'application/pdf' });
    const encoder = vi.fn(async () => jpeg1x1());
    const result = await compressPdfImages(file, opts(encoder));
    expect(result.reason).toBe('encrypted');
    expect(result.blob).toBe(file);
    expect(encoder).not.toHaveBeenCalled();
  });

  it('leaves an unencrypted file unencrypted', async () => {
    const result = await compressPdfImages(fixture('scan.pdf'), opts(fakeEncoder));
    const doc = await PDFDocument.load(new Uint8Array(await result.blob.arrayBuffer()), { updateMetadata: false });
    expect(doc.isEncrypted).toBe(false);
  });
});
