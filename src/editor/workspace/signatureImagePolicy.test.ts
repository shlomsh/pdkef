import { describe, expect, it, vi } from 'vitest';
import {
  MAX_SAVED_SIGNATURE_ENCODED_BYTES,
  MAX_SAVED_SIGNATURE_PIXELS,
  TYPED_SIGNATURE_MAX_FONT_PX,
  TYPED_SIGNATURE_MIN_FONT_PX,
  constrainSignatureDimensions,
  dataUrlEncodedBytes,
  encodeSignatureCanvas,
  typedSignatureFontPx,
} from './signatureImagePolicy.ts';

describe('saved signature image policy', () => {
  it('downsamples oversized uploads proportionally before they reach storage', () => {
    const dimensions = constrainSignatureDimensions({ width: 6000, height: 4000 });
    expect(dimensions.width * dimensions.height).toBeLessThanOrEqual(MAX_SAVED_SIGNATURE_PIXELS);
    expect(dimensions.width / dimensions.height).toBeCloseTo(1.5, 2);
  });

  it('measures encoded payload bytes rather than trusting a filename or source size', () => {
    const payload = 'AAAA'; // three decoded bytes
    expect(dataUrlEncodedBytes(`data:image/png;base64,${payload}`)).toBe(3);
    expect(MAX_SAVED_SIGNATURE_ENCODED_BYTES).toBe(750_000);
  });

  it('re-encodes an oversized upload until both measured caps hold', () => {
    const originalContext = HTMLCanvasElement.prototype.getContext;
    const originalToDataUrl = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(function (this: HTMLCanvasElement) {
      // Simulate an entropy-heavy PNG whose real encoded size follows pixels.
      return `data:image/png;base64,${'A'.repeat(this.width * this.height * 2)}`;
    });
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 2400;
      canvas.height = 1800;
      const encoded = encodeSignatureCanvas(canvas);
      expect(encoded.width * encoded.height).toBeLessThanOrEqual(MAX_SAVED_SIGNATURE_PIXELS);
      expect(dataUrlEncodedBytes(encoded.dataUrl)).toBeLessThanOrEqual(MAX_SAVED_SIGNATURE_ENCODED_BYTES);
      expect(encoded.downsampled).toBe(true);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalContext;
      HTMLCanvasElement.prototype.toDataURL = originalToDataUrl;
    }
  });
});

describe('typed signature font size (SIGN-37)', () => {
  it('sizes a typical name within the clamp, with the canvas inside 90% of the pixel budget', () => {
    const widthPerPx = 5;
    const heightPerPx = 1.3;
    const fontPx = typedSignatureFontPx({ widthPerPx, heightPerPx });
    expect(fontPx).toBeGreaterThanOrEqual(TYPED_SIGNATURE_MIN_FONT_PX);
    expect(fontPx).toBeLessThanOrEqual(TYPED_SIGNATURE_MAX_FONT_PX);
    expect((widthPerPx * fontPx) * (heightPerPx * fontPx)).toBeLessThanOrEqual(0.9 * MAX_SAVED_SIGNATURE_PIXELS);
  });

  it('clamps a very long name down to the minimum font size', () => {
    const fontPx = typedSignatureFontPx({ widthPerPx: 500, heightPerPx: 1.3 });
    expect(fontPx).toBe(TYPED_SIGNATURE_MIN_FONT_PX);
  });

  it('clamps a short name up to the maximum font size', () => {
    const fontPx = typedSignatureFontPx({ widthPerPx: 1, heightPerPx: 1.3 });
    expect(fontPx).toBe(TYPED_SIGNATURE_MAX_FONT_PX);
  });

  it('returns the minimum font size for bad input', () => {
    expect(typedSignatureFontPx({ widthPerPx: NaN, heightPerPx: 1.3 })).toBe(TYPED_SIGNATURE_MIN_FONT_PX);
    expect(typedSignatureFontPx({ widthPerPx: 0, heightPerPx: 1.3 })).toBe(TYPED_SIGNATURE_MIN_FONT_PX);
    expect(typedSignatureFontPx({ widthPerPx: -5, heightPerPx: 1.3 })).toBe(TYPED_SIGNATURE_MIN_FONT_PX);
    expect(typedSignatureFontPx({ widthPerPx: 5, heightPerPx: Infinity })).toBe(TYPED_SIGNATURE_MIN_FONT_PX);
  });
});
