import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Quad } from '#lib/pageEnhance/quad.ts';
import { FULL_QUAD } from '../quad.ts';
import { inspectWith, processWith, type CanvasKit } from './steps.ts';

// The worker's measuring failure travels back with the page, since only the main thread reports.
vi.mock('#lib/pageEnhance/dewarp/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#lib/pageEnhance/dewarp/index.ts')>();
  return { ...actual, measureBend: vi.fn(actual.measureBend) };
});
const { measureBend } = await import('#lib/pageEnhance/dewarp/index.ts');
vi.mock('./upright.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./upright.ts')>();
  return { ...actual, uprightTurns: vi.fn(actual.uprightTurns) };
});
const { uprightTurns } = await import('./upright.ts');

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

describe('processWith folded corners', () => {
  it('paints the dark triangle a pinned sheet leaves in a corner in the paper colour', async () => {
    const [w, h] = [400, 300];
    const photo: Source = { width: w, height: h, pixel: (x, y) => (w - 1 - x + y <= 60 ? 20 : 230) };
    const surfaces: { width: number; pixel(x: number, y: number): number }[] = [];
    const kit = fakeKit(photo);
    const surface = kit.surface;
    kit.surface = (sw, sh) => {
      const made = surface(sw, sh);
      surfaces.push(made.canvas as unknown as { width: number; pixel(x: number, y: number): number });
      return made;
    };
    const { page } = await processWith(kit, new Blob(), FULL_QUAD, 'original');
    const out = surfaces.find((c) => c.width === page.width)!;
    expect(out.pixel(page.width - 1, 0)).toBe(230);
  });
});

describe('processWith sizing', () => {
  it('sizes a strongly tilted A4 page to its true 1.414 proportions, not to its edge lengths', async () => {
    // An A4 page seen by a pinhole camera (focal 0.75 x the long side), tilted 50 degrees, as normalized corners.
    const [W, H, f, tilt] = [1600, 1200, 0.75 * 1600, (50 * Math.PI) / 180];
    const quad = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => {
      const x = (sx * Math.SQRT2) / 2;
      const y = sy / 2;
      const z = 2.5 + y * Math.sin(tilt);
      return { x: (W / 2 + (f * x) / z) / W, y: (H / 2 + (f * y * Math.cos(tilt)) / z) / H };
    }) as unknown as Quad;
    const { page } = await processWith(fakeKit(gray(W, H)), new Blob(), quad, 'original');
    expect(Math.max(page.width, page.height) / Math.min(page.width, page.height)).toBeCloseTo(Math.SQRT2, 2);
  });
});

describe('inspectWith', () => {
  it('makes a preview no longer than 1600 px and reports the photo\'s own size', async () => {
    const inspected = await inspectWith(fakeKit(gray(4000, 3000)), new Blob());
    expect([inspected.width, inspected.height]).toEqual([4000, 3000]);
    expect(encodes[0]).toEqual({ width: 1600, height: 1200, type: 'image/jpeg', quality: 0.85 });
    expect(freed).toBe(made);
  });

  it('reads the turn of a photo with no corners from its whole frame', async () => {
    vi.mocked(uprightTurns).mockReturnValueOnce(3);
    const inspected = await inspectWith(fakeKit(gray(400, 300)), new Blob());
    expect(inspected.quad).toBeNull();
    expect(vi.mocked(uprightTurns).mock.lastCall?.[1]).toEqual(FULL_QUAD);
    expect(inspected.turns).toBe(3);
  });
});
