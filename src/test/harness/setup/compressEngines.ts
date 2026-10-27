/**
 * Vitest setup for the Compress island tests (ARCH-78): the three compression engines need a canvas,
 * `createImageBitmap` and image codecs that jsdom lacks, so they are the edge here. A test steers one
 * through the spy it imports from the engine's own module (`compressLib.compressPdf.mockImplementation(...)`)
 * and builds the result shape it wants; these are only the defaults. Everything around them (analysis of the
 * PDF, the probe's gate, the state machine, drafts, analytics) runs for real.
 */
import { vi } from 'vitest';

vi.mock('../../../tools/compress/lib/compressImages.js', () => ({
  IMAGE_LEVELS: {
    high: { maxLongSidePx: 1000, quality: 0.4 },
    medium: { maxLongSidePx: 1600, quality: 0.6 },
    low: { maxLongSidePx: 2400, quality: 0.8 },
  },
  compressPdfImages: vi.fn(),
  compressPdfImagesToTarget: vi.fn(),
}));

vi.mock('../../../tools/compress/lib/compress.js', () => ({
  compressPdf: vi.fn(() => Promise.resolve({ blob: new Blob(['%PDF-1.4-compressed'], { type: 'application/pdf' }), rasterBytes: 500 })),
  compressPdfToTarget: vi.fn(() => Promise.resolve({ blob: new Blob(['%PDF-1.4-target'], { type: 'application/pdf' }), metTarget: true, rasterBytes: 500 })),
}));

vi.mock('../../../tools/compress/lib/compressImage.js', () => ({
  compressImageToTarget: vi.fn(() => Promise.resolve({
    blob: new Blob(['jpeg-bytes'], { type: 'image/jpeg' }),
    metTarget: true,
    width: 800,
    height: 600,
    originalWidth: 1600,
    originalHeight: 1200,
  })),
}));
