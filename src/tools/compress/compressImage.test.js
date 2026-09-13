import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { compressImageToTarget } from './compressImage.js';

// jsdom has no real image decoding or canvas encoding, so both are stubbed
// the same way compress.test.js stubs pdfjs/canvas: swap the browser APIs
// this module calls for deterministic fakes, then assert on the outcome.
//
// jsdom does not implement `createImageBitmap` at all, so compressImage.js's
// primary decode path throws and it falls back to the <img> element path on
// its own - exactly the fallback the ticket asks for, exercised for free by
// running these tests under jsdom. That fallback path is what gets stubbed
// below (Image#src/onload, URL.createObjectURL).
const ORIGINAL_WIDTH = 1000;
const ORIGINAL_HEIGHT = 1000;

describe('compressImageToTarget', () => {
  let originalToBlob;
  let originalGetContext;
  let originalCreateObjectURL;
  let originalRevokeObjectURL;
  let originalImageSrcDescriptor;

  beforeAll(() => {
    expect(typeof globalThis.createImageBitmap).not.toBe('function');

    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();

    // Simulate a decoded ORIGINAL_WIDTH x ORIGINAL_HEIGHT image firing
    // onload as soon as `src` is set, since jsdom never actually loads the
    // fake blob: URL.
    originalImageSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      set() {
        Object.defineProperty(this, 'naturalWidth', { value: ORIGINAL_WIDTH, configurable: true });
        Object.defineProperty(this, 'naturalHeight', { value: ORIGINAL_HEIGHT, configurable: true });
        this.onload?.();
      },
      get() {
        return 'blob:fake-url';
      },
    });

    originalToBlob = HTMLCanvasElement.prototype.toBlob;
    originalGetContext = HTMLCanvasElement.prototype.getContext;

    // Deterministic fake JPEG encoder: size is a known function of the
    // canvas area and the requested quality, so scale/quality outcomes are
    // predictable instead of just "it ran". Real encoders are monotonic in
    // both, which this preserves.
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type, quality) {
      const size = Math.max(1, Math.round(this.width * this.height * quality));
      callback(new Blob([new Uint8Array(size)], { type: type || 'image/jpeg' }));
    };

    HTMLCanvasElement.prototype.getContext = function getContext() {
      const canvasEl = this;
      const baseContext = {
        canvas: canvasEl,
        fillStyle: '',
        strokeStyle: '',
      };
      return new Proxy(baseContext, {
        get(target, prop) {
          if (prop in target) return target[prop];
          return vi.fn();
        },
      });
    };
  });

  afterAll(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    if (originalImageSrcDescriptor) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', originalImageSrcDescriptor);
    }
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  function makeFile({ sizeBytes, type = 'image/jpeg', name = 'photo.jpg' }) {
    return new File([new Uint8Array(sizeBytes)], name, { type });
  }

  it('passes the file through unchanged when already under target', async () => {
    const file = makeFile({ sizeBytes: 1000 });
    const onProgress = vi.fn();

    const result = await compressImageToTarget(file, { targetKB: 10, onProgress });

    expect(result.blob).toBe(file);
    expect(result.metTarget).toBe(true);
    expect(result.width).toBe(ORIGINAL_WIDTH);
    expect(result.height).toBe(ORIGINAL_HEIGHT);
    expect(result.originalWidth).toBe(ORIGINAL_WIDTH);
    expect(result.originalHeight).toBe(ORIGINAL_HEIGHT);
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it('meets the target by searching scale and quality', async () => {
    // File itself is over target so the search runs. With ORIGINAL 1000x1000
    // and the fake encoder size = width*height*quality, scale 1 at a low
    // quality comfortably fits a 50KB target.
    const file = makeFile({ sizeBytes: 900000 });
    const onProgress = vi.fn();

    const result = await compressImageToTarget(file, { targetKB: 50, onProgress });

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.metTarget).toBe(true);
    expect(result.blob.size).toBeLessThanOrEqual(50 * 1024);
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it('reports an honest miss when nothing fits, returning the smallest result found', async () => {
    // Even the lowest scale (0.15) at minimum quality can't fit an
    // unreasonably small target, so metTarget must come back false while
    // still returning the smallest blob the search found.
    const file = makeFile({ sizeBytes: 900000 });

    const result = await compressImageToTarget(file, { targetKB: 0.01 });

    expect(result.metTarget).toBe(false);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.size).toBeGreaterThan(0);
    // The smallest scale should have been used for the fallback.
    expect(result.width).toBeLessThan(ORIGINAL_WIDTH);
    expect(result.height).toBeLessThan(ORIGINAL_HEIGHT);
  });

  it('produces image/jpeg output for PNG input', async () => {
    const file = makeFile({ sizeBytes: 900000, type: 'image/png', name: 'screenshot.png' });

    const result = await compressImageToTarget(file, { targetKB: 50 });

    expect(result.blob.type).toBe('image/jpeg');
  });
});
