import { describe, expect, it } from 'vitest';
import {
  MAX_SAVED_SIGNATURE_ENCODED_BYTES,
  MAX_SAVED_SIGNATURE_PIXELS,
  dataUrlEncodedBytes,
  encodeSignatureCanvas,
} from './signatureImagePolicy.ts';

describe('saved signature image policy', () => {
  it('re-encodes an oversized upload until both measured caps hold', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 850;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(canvas.width, canvas.height);
    let seed = 0x2545f491;
    for (let i = 0; i < image.data.length; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      image.data[i] = seed >>> 24;
    }
    context.putImageData(image, 0, 0);
    const encoded = encodeSignatureCanvas(canvas);
    expect(encoded.width * encoded.height).toBeLessThanOrEqual(MAX_SAVED_SIGNATURE_PIXELS);
    expect(dataUrlEncodedBytes(encoded.dataUrl)).toBeLessThanOrEqual(MAX_SAVED_SIGNATURE_ENCODED_BYTES);
    expect(encoded.downsampled).toBe(true);
  });
});
