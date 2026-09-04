import { describe, expect, it, vi } from 'vitest';
import {
  MAX_SAVED_SIGNATURE_ENCODED_BYTES,
  MAX_SAVED_SIGNATURE_PIXELS,
  constrainSignatureDimensions,
  dataUrlEncodedBytes,
  encodeSignatureCanvas,
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
