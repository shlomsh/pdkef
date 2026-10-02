// Compress that keeps every page as it is: text, vectors, fonts and links are
// untouched, and only the embedded images are recompressed in place (COMP-01).
import { getPdfLib } from '../../lib/pdfLib.js';
import { canvasToBlob } from './compress.js';
import { permissionsFromP, randomOwnerPassword } from './pdfPermissions.js';
import { stripExif } from './jpegBytes.js';

const MIN_PIXELS = 64 * 64;
const sameFilters = (filters, name) => filters.length === 1 && filters[0] === name;

// pdf-lib's Flate decoder ignores /DecodeParms, so a predicted image would
// decode sheared, and a /Decode array would be dropped without being applied:
// both are kept as they are rather than re-encoded wrongly.
export function planImageRewrite(image) {
  if (image.isMask || image.smaskHasMatte) return 'keep';
  // A colour-key /Mask matches exact sample values, which JPEG re-encoding no longer reproduces.
  if (image.hasColorKeyMask) return 'keep';
  if (image.predictor !== null || image.hasDecode) return 'keep';
  if (image.bitsPerComponent !== 8) return 'keep';
  if (!['DeviceRGB', 'DeviceGray', 'ICCBased'].includes(image.colorSpace)) return 'keep';
  if (image.components !== 1 && image.components !== 3) return 'keep';
  if (!sameFilters(image.filters, 'DCTDecode') && !sameFilters(image.filters, 'FlateDecode')) return 'keep';
  if (image.width * image.height < MIN_PIXELS) return 'keep';
  return 'reencode';
}

export function targetDimensions(width, height, maxLongSidePx) {
  const longSide = Math.max(width, height);
  const scale = longSide > maxLongSidePx ? maxLongSidePx / longSide : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function release(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}

export async function encodeImageOnCanvas({ image, stream, target, quality, decodeRaw }) {
  const source = document.createElement('canvas');
  const out = document.createElement('canvas');
  try {
    let drawable;
    if (image.filters[0] === 'DCTDecode') {
      // No colour management: the PDF's own colour space stays on the output, so converting here would apply it twice.
      // EXIF orientation is applied by the browser but ignored by PDF viewers, so it goes first.
      drawable = await createImageBitmap(new Blob([stripExif(stream.getContents())], { type: 'image/jpeg' }), {
        colorSpaceConversion: 'none',
      });
      // A real size that differs from the PDF's dict (or an EXIF rotation that survived) would be stretched.
      if (drawable.width !== image.width || drawable.height !== image.height) {
        drawable.close?.();
        return null;
      }
    } else {
      const samples = decodeRaw(stream).decode();
      const perPixel = image.components;
      const { width, height } = image;
      if (samples.length < width * height * perPixel) return null;
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let p = 0, s = 0, d = 0; p < width * height; p += 1, d += 4) {
        if (perPixel === 1) {
          rgba[d] = rgba[d + 1] = rgba[d + 2] = samples[s];
        } else {
          rgba[d] = samples[s];
          rgba[d + 1] = samples[s + 1];
          rgba[d + 2] = samples[s + 2];
        }
        rgba[d + 3] = 255;
        s += perPixel;
      }
      source.width = width;
      source.height = height;
      source.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
      drawable = source;
    }
    out.width = target.width;
    out.height = target.height;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(drawable, 0, 0, target.width, target.height);
    drawable.close?.();
    const blob = await canvasToBlob(out, 'image/jpeg', quality);
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    // expected: an image this browser cannot decode (odd encoding, damaged data) is simply left as it was
    return null;
  } finally {
    release(source);
    release(out);
  }
}

/**
 * @param {File} file
 * @param {{ maxLongSidePx: number, quality: number, onProgress?: (p: number) => void, encodeImage?: typeof encodeImageOnCanvas }} options
 */
export async function compressPdfImages(
  file,
  { maxLongSidePx, quality, onProgress, encodeImage = encodeImageOnCanvas },
) {
  const beforeBytes = file.size;
  // keptBytes: image bytes the pass could not attempt (not planned, not a raw stream, or undecodable).
  // An image re-encoded but not smaller is already compact, so it is not counted.
  let keptBytes = 0;
  let imageBytes = 0;
  const untouched = (reason) => ({
    blob: file, beforeBytes, afterBytes: beforeBytes, rewritten: 0, reason, keptBytes, imageBytes,
  });

  const { PDFDocument, PDFName, PDFRef, PDFRawStream, PDFDict, PDFNumber, decodePDFRawStream } = await getPdfLib();
  const { analyzePdfImages } = await import('./analyzePdf.js');

  const bytes = new Uint8Array(await file.arrayBuffer());
  let doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const wasEncrypted = doc.isEncrypted;
  let permissions = null;
  if (wasEncrypted) {
    // Most encrypted PDFs are owner-password-only: they open with an empty password and only restrict editing.
    // Only the Standard handler with a readable /P can be carried across; anything else stays as it is.
    const encrypt = doc.context.lookup(doc.context.trailerInfo.Encrypt);
    const handler = encrypt instanceof PDFDict ? encrypt.get(PDFName.of('Filter')) : null;
    const p = encrypt instanceof PDFDict ? doc.context.lookup(encrypt.get(PDFName.of('P'))) : null;
    if (handler !== PDFName.of('Standard') || !(p instanceof PDFNumber)) return untouched('encrypted');
    permissions = permissionsFromP(p.asNumber());
    try {
      doc = await PDFDocument.load(bytes, { password: '', updateMetadata: false });
    } catch (err) {
      // Same wording check as security.js: a file that needs a real password goes back untouched.
      if (/password/i.test(err?.message ?? '')) return untouched('encrypted');
      throw err;
    }
  }

  const images = analyzePdfImages(doc);
  if (images.length === 0) return untouched('no-images');

  imageBytes = images.reduce((sum, image) => sum + image.bytes, 0);
  const planned = images.filter((image) => planImageRewrite(image) === 'reencode');
  for (const image of images) if (!planned.includes(image)) keptBytes += image.bytes;
  let rewritten = 0;
  for (let i = 0; i < planned.length; i += 1) {
    const image = planned[i];
    const [objectNumber, generation] = image.ref.split(' ').map(Number);
    const ref = PDFRef.of(objectNumber, generation);
    const stream = doc.context.lookup(ref);
    if (stream instanceof PDFRawStream) {
      const target = targetDimensions(image.width, image.height, maxLongSidePx);
      const jpeg = await encodeImage({ image, stream, target, quality, decodeRaw: decodePDFRawStream });
      if (!jpeg) keptBytes += image.bytes;
      if (jpeg && jpeg.length < image.bytes) {
        const dict = stream.dict.clone(doc.context);
        dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
        dict.set(PDFName.of('Width'), doc.context.obj(target.width));
        dict.set(PDFName.of('Height'), doc.context.obj(target.height));
        // An RGB ICC profile still describes the JPEG's samples; everything else becomes DeviceRGB.
        if (!(image.colorSpace === 'ICCBased' && image.components === 3)) {
          dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
        }
        dict.set(PDFName.of('BitsPerComponent'), doc.context.obj(8));
        // /SMask is kept as cloned: the mask stream is untouched and may differ in size from the new image.
        dict.delete(PDFName.of('SMaskInData'));
        dict.delete(PDFName.of('DecodeParms'));
        dict.delete(PDFName.of('Decode'));
        doc.context.assign(ref, PDFRawStream.of(dict, jpeg));
        rewritten += 1;
      }
    } else {
      keptBytes += image.bytes;
    }
    onProgress?.((i + 1) / planned.length);
  }

  // Nothing replaced: skip re-encryption and the save altogether.
  if (rewritten === 0) return untouched(planned.length === 0 ? 'unsupported' : 'no-gain');

  // Compressing must not quietly strip a file's restrictions: re-apply the same permissions
  // (empty user password, a fresh random owner password).
  if (wasEncrypted) doc.encrypt({ userPassword: '', ownerPassword: randomOwnerPassword(), permissions });
  const saved = await doc.save({ useObjectStreams: true });
  const afterBytes = saved.byteLength;
  // A re-save with nothing replaced can still shrink a file (object streams); that is not our gain.
  if (afterBytes >= beforeBytes) return untouched('no-gain');
  return {
    blob: new Blob([saved], { type: 'application/pdf' }),
    beforeBytes,
    afterBytes,
    rewritten,
    reason: 'smaller',
    keptBytes,
    imageBytes,
  };
}

// The three levels, as image targets. Keys are the island's existing level ids:
// 'high' is the card titled "Extreme Compression", 'medium' "Recommended", 'low' "High Quality".
export const IMAGE_LEVELS = {
  high: { maxLongSidePx: 1000, quality: 0.4 },
  medium: { maxLongSidePx: 1600, quality: 0.6 },
  low: { maxLongSidePx: 2400, quality: 0.8 },
};

// Tried in order, best quality first, for Target Size.
export const TARGET_IMAGE_LADDER = [
  { maxLongSidePx: 2400, quality: 0.8 },
  { maxLongSidePx: 1600, quality: 0.6 },
  { maxLongSidePx: 1000, quality: 0.4 },
  { maxLongSidePx: 800, quality: 0.3 },
  { maxLongSidePx: 600, quality: 0.2 },
];

const BISECT_STEPS = 4;

// A rung t of the way from a to b (t = 0 is a, t = 1 is b).
export function lerpRung(a, b, t) {
  return {
    maxLongSidePx: Math.round(a.maxLongSidePx + (b.maxLongSidePx - a.maxLongSidePx) * t),
    quality: Math.round((a.quality + (b.quality - a.quality) * t) * 100) / 100,
  };
}

/**
 * Walks the ladder to the first rung under target, then bisects between it and the rung above
 * so the result uses most of the budget instead of landing far under it.
 * @param {File} file
 * @param {{ targetKB: number, onProgress?: (p: number) => void, encodeImage?: typeof encodeImageOnCanvas }} options
 */
export async function compressPdfImagesToTarget(file, { targetKB, onProgress, encodeImage }) {
  const beforeBytes = file.size;
  const targetBytes = Math.max(1, Math.round(targetKB * 1024));
  const unchanged = (reason, metTarget) => ({
    blob: file, metTarget, beforeBytes, afterBytes: beforeBytes, rewritten: 0, reason,
  });
  if (beforeBytes <= targetBytes) {
    onProgress?.(1);
    return unchanged('under-target', true);
  }

  const slots = TARGET_IMAGE_LADDER.length + BISECT_STEPS;
  const run = (rung, slot) =>
    compressPdfImages(file, {
      ...rung,
      ...(encodeImage ? { encodeImage } : {}),
      onProgress: (p) => onProgress?.((slot + p) / slots),
    });

  let smallest = null;
  for (let i = 0; i < TARGET_IMAGE_LADDER.length; i += 1) {
    const result = await run(TARGET_IMAGE_LADDER[i], i);
    // No rung can change a file with no images, one that is encrypted, or one whose images are all kept.
    if (result.reason === 'no-images' || result.reason === 'encrypted' || result.reason === 'unsupported') {
      onProgress?.(1);
      return { ...result, metTarget: false };
    }
    if (result.reason !== 'smaller') continue;
    if (result.afterBytes <= targetBytes) {
      let best = result;
      if (i > 0) {
        let lo = 0;
        let hi = 1;
        for (let step = 0; step < BISECT_STEPS; step += 1) {
          const mid = (lo + hi) / 2;
          const trial = await run(
            lerpRung(TARGET_IMAGE_LADDER[i - 1], TARGET_IMAGE_LADDER[i], mid),
            TARGET_IMAGE_LADDER.length + step,
          );
          if (trial.reason === 'smaller' && trial.afterBytes <= targetBytes) {
            best = trial;
            hi = mid;
          } else {
            lo = mid;
          }
        }
      }
      onProgress?.(1);
      return { ...best, metTarget: true };
    }
    if (!smallest || result.afterBytes < smallest.afterBytes) smallest = result;
  }
  onProgress?.(1);
  return smallest ? { ...smallest, metTarget: false } : unchanged('no-gain', false);
}
