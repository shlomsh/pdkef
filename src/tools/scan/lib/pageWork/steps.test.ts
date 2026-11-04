import { afterEach, describe, expect, it, vi } from 'vitest';
import { FULL_QUAD } from '../quad.ts';
import { inspectWith, processWith, type CanvasKit } from './steps.ts';

// The worker's measuring failure travels back with the page, since only the main thread reports.
vi.mock('../dewarp/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dewarp/index.ts')>();
  return { ...actual, measureBend: vi.fn(actual.measureBend) };
});
const { measureBend } = await import('../dewarp/index.ts');

// EDGE: node has no canvas. A kit of plain RGBA buffers: drawImage samples nearest-neighbour, and
// toBlob records what was encoded, as the worker's OffscreenCanvas and the page's <canvas> would.
interface Source { width: number; height: number; pixel(x: number, y: number): number }
let encodes: { width: number; height: number; type: string; quality: number }[] = [];
let freed = 0;
let made = 0;

function fakeKit(photo: Source): CanvasKit {
  return {
    surface(width, height) {
      made += 1;
      const data = new Uint8ClampedArray(width * height * 4);
      const canvas = { width, height, pixel: (x: number, y: number) => data[(y * width + x) * 4] };
      const ctx = {
        fillStyle: '',
        fillRect: () => data.fill(255),
        drawImage: (src: Source, _x: number, _y: number, dw: number, dh: number) => {
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              const v = src.pixel(Math.floor(((x + 0.5) * src.width) / dw), Math.floor(((y + 0.5) * src.height) / dh));
              data.set([v, v, v, 255], (y * width + x) * 4);
            }
          }
        },
        getImageData: () => ({ data: data.slice(), width, height }),
        putImageData: (image: { data: Uint8ClampedArray }) => data.set(image.data),
      };
      return {
        canvas: canvas as unknown as OffscreenCanvas,
        ctx: ctx as unknown as OffscreenCanvasRenderingContext2D,
        toBlob: async (type, quality) => {
          encodes.push({ width, height, type, quality });
          return new Blob([`${width}x${height}`], { type });
        },
        free: () => { freed += 1; },
      };
    },
    decode: async () => ({ source: photo as unknown as CanvasImageSource, width: photo.width, height: photo.height, close: () => {} }),
  };
}

const gray = (width: number, height: number): Source => ({ width, height, pixel: () => 128 });

afterEach(() => {
  encodes = [];
  freed = 0;
  made = 0;
  vi.mocked(measureBend).mockClear();
});

vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });

describe('processWith', () => {
  it('flattens a flat page by its corners alone: no bend, nothing to report, every canvas freed', async () => {
    const { page, measureError } = await processWith(fakeKit(gray(400, 300)), new Blob(), FULL_QUAD, 'original');
    expect(measureError).toBeNull();
    expect(page.bentPx).toBe(0);
    expect([page.width, page.height]).toEqual([394, 295]);
    expect(encodes).toEqual([
      { width: 394, height: 295, type: 'image/jpeg', quality: 0.92 },
      { width: 394, height: 295, type: 'image/jpeg', quality: 0.8 },
    ]);
    expect(freed).toBe(made);
  });

  it('hands back a measuring failure with the page, flattened by its corners', async () => {
    const error = new Error('measure failed');
    vi.mocked(measureBend).mockImplementationOnce(() => { throw error; });
    const { page, measureError } = await processWith(fakeKit(gray(400, 300)), new Blob(), FULL_QUAD, 'original');
    expect(measureError).toBe(error);
    expect(page.bentPx).toBe(0);
    expect(page.width).toBe(394);
  });
});

describe('inspectWith', () => {
  it('makes a preview no longer than 1600 px and reports the photo\'s own size', async () => {
    const inspected = await inspectWith(fakeKit(gray(4000, 3000)), new Blob());
    expect([inspected.width, inspected.height]).toEqual([4000, 3000]);
    expect(encodes[0]).toEqual({ width: 1600, height: 1200, type: 'image/jpeg', quality: 0.85 });
    expect(freed).toBe(made);
  });
});
