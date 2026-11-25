import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { compressImageToTarget } from './compressImage.js';

// jsdom has a real 2D canvas but no createImageBitmap and cannot load a
// blob: URL into an Image, so the real decode cannot run here. The Image
// load and the encoder stay swapped (marked Forced below) and the object URL
// calls are real, only watched.
//
// jsdom does not implement `createImageBitmap` at all, so compressImage.js's
// primary decode path throws and it falls back to the <img> element path on
// its own, exercised for free by running these tests under jsdom.
const ORIGINAL_WIDTH = 1000;
const ORIGINAL_HEIGHT = 1000;

describe('compressImageToTarget', () => {
  let originalToBlob;
  let createSpy;
  let revokeSpy;
  let originalImageSrcDescriptor;

  beforeAll(() => {
    expect(typeof globalThis.createImageBitmap).not.toBe('function');

    // Spy-through: Node's real createObjectURL accepts jsdom Blobs.
    createSpy = vi.spyOn(URL, 'createObjectURL');
    revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    // Forced: jsdom cannot load a blob: URL into an Image, so the decode is swapped.
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

    // Forced: the undecoded picture draws nothing, and a blank canvas's real JPEG fits every target here at the first try,
    // so the search would never run. This encoder's size is a known function of the canvas area and the quality; real
    // encoders are monotonic in both, which this preserves.
    originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type, quality) {
      const size = Math.max(1, Math.round(this.width * this.height * quality));
      callback(new Blob([new Uint8Array(size)], { type: type || 'image/jpeg' }));
    };
  });

  afterAll(() => {
    createSpy.mockRestore();
    revokeSpy.mockRestore();
    if (originalImageSrcDescriptor) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', originalImageSrcDescriptor);
    }
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
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
    expect(result.blob.size).toBeLessThanOrEqual(50 * 1000);
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
