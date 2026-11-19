import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Quad } from '#lib/pageEnhance/quad.ts';
import { FLAT_PAGE, type EdgeCurves } from '#lib/pageEnhance/dewarp/index.ts';
import type { Pins, Sides } from '../edges/follow.ts';
import { FULL_QUAD } from '../quad.ts';
import { inspectWith, processWith, splitWith, traceWith, type CanvasKit } from './steps.ts';

// The real modules run; the spies show what they were handed. A test that forces a failure or a trace the
// gray fixtures cannot give does so on one call with mock*Once.
vi.mock('#lib/pageEnhance/dewarp/index.ts', { spy: true });
vi.mock('#lib/pageEnhance/plan.ts', { spy: true });
vi.mock('./upright.ts', { spy: true });
vi.mock('../edges/follow.ts', { spy: true });
vi.mock('./tracedCurves.ts', { spy: true });
vi.mock('../evenMargins.ts', { spy: true });
import { measureBend } from '#lib/pageEnhance/dewarp/index.ts';
import { spreadQuads } from '#lib/pageEnhance/plan.ts';
import { uprightTurns } from './upright.ts';
import { traceSides } from '../edges/follow.ts';
import { curvesFromSides } from './tracedCurves.ts';
import { evenMargins } from '../evenMargins.ts';

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
  vi.mocked(traceSides).mockClear();
  vi.mocked(curvesFromSides).mockClear();
});

vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });

describe('processWith', () => {
  it('crops a photo inside its corners, and never a PDF sheet: its corners are exact and its print can run to the edge', async () => {
    const photo = await processWith(fakeKit(gray(400, 300)), new Blob(), FULL_QUAD, 'original');
    const sheet = await processWith(fakeKit(gray(400, 300)), new Blob(), FULL_QUAD, 'original', false);
    expect([photo.page.width, photo.page.height]).toEqual([394, 295]);
    expect([sheet.page.width, sheet.page.height]).toEqual([400, 300]);
  });

  it('reads paper edges on a photo, and none on a PDF sheet', async () => {
    await processWith(fakeKit(gray(400, 300)), new Blob(), FULL_QUAD, 'original');
    await processWith(fakeKit(gray(400, 300)), new Blob(), FULL_QUAD, 'original', false);
    expect(vi.mocked(measureBend).mock.calls.map((call) => call[5])).toEqual([true, false]);
  });

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

describe('processWith traced border', () => {
  const INNER: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
  const SIDES = [[{ x: 0.5, y: 0.1 }], [], [], []] as unknown as Sides;
  const PINS: Pins = [[{ k: 0.5, at: { x: 0.5, y: 0.12 } }], [], [], []];
  const CURVES = { traced: true } as unknown as EdgeCurves;
  const lastBendArgs = () => vi.mocked(measureBend).mock.calls.at(-1)!;

  it('hands the bend measure the curves traced from the sides the editor draws, so the flattening follows the drawn border', async () => {
    vi.mocked(traceSides).mockReturnValueOnce(SIDES);
    vi.mocked(curvesFromSides).mockReturnValueOnce(CURVES);
    vi.mocked(measureBend).mockImplementationOnce(() => FLAT_PAGE);
    await processWith(fakeKit(gray(400, 300)), new Blob(), INNER, 'original', true, PINS, true);
    expect(lastBendArgs()[6]).toBe(CURVES);
    expect(curvesFromSides).toHaveBeenCalledWith(INNER, SIDES, 400, 300);
  });

  it('traces on the gray copy at the trace size, with the page quad and its pins', async () => {
    await processWith(fakeKit(gray(3000, 2000)), new Blob(), INNER, 'original', true, PINS, true);
    const [image, quad, pins] = vi.mocked(traceSides).mock.calls[0];
    expect([image.width, image.height]).toEqual([1536, 1024]);
    expect(quad).toBe(INNER);
    expect(pins).toBe(PINS);
  });

  it('gives the bend measure no traced border for the whole picture, in any corner order, and never traces it', async () => {
    const [tl, tr, br, bl] = FULL_QUAD;
    for (const quad of [FULL_QUAD, [bl, tl, tr, br], [br, bl, tl, tr]] as Quad[]) {
      await processWith(fakeKit(gray(400, 300)), new Blob(), quad, 'original');
    }
    expect(traceSides).not.toHaveBeenCalled();
    expect(vi.mocked(measureBend).mock.calls.every((call) => call.length === 6)).toBe(true);
  });

  it('traces a fine PDF sheet with an inner quad too: paperEdges only means the inset crop', async () => {
    await processWith(fakeKit(gray(400, 300)), new Blob(), INNER, 'original', false, null, true);
    expect(traceSides).toHaveBeenCalledTimes(1);
    expect(lastBendArgs()[5]).toBe(false);
    expect(lastBendArgs()).toHaveLength(7);
  });

  it('does not trace a page that is not fine, with or without pins: the straight lines stand, and the bend is measured as before', async () => {
    // Protects: the traced border is used only once the person turned Fine-tune edges on; pins alone do not trace.
    await processWith(fakeKit(gray(400, 300)), new Blob(), INNER, 'original', false, null, false);
    await processWith(fakeKit(gray(400, 300)), new Blob(), INNER, 'original', false, PINS, false);
    expect(traceSides).not.toHaveBeenCalled();
    expect(vi.mocked(measureBend).mock.calls.every((call) => call.length === 6)).toBe(true);
  });

  it('traces a fine page with its pins', async () => {
    // Protects: Fine-tune edges on follows the pinned border.
    await processWith(fakeKit(gray(400, 300)), new Blob(), INNER, 'original', false, PINS, true);
    expect(traceSides).toHaveBeenCalledTimes(1);
    expect(lastBendArgs()).toHaveLength(7);
  });

  it('traces a fine page, and still never the whole picture, whatever fine says', async () => {
    await processWith(fakeKit(gray(400, 300)), new Blob(), INNER, 'original', true, null, true);
    expect(traceSides).toHaveBeenCalledTimes(1);
    await processWith(fakeKit(gray(400, 300)), new Blob(), FULL_QUAD, 'original', true, PINS, true);
    expect(traceSides).toHaveBeenCalledTimes(1);
  });

  it('still produces the page when tracing throws, measures it as before, and hands the error back to be reported', async () => {
    const error = new Error('trace failed');
    vi.mocked(traceSides).mockImplementationOnce(() => { throw error; });
    const { page, measureError } = await processWith(fakeKit(gray(400, 300)), new Blob(), INNER, 'original', true, null, true);
    expect(measureError).toBe(error);
    expect(lastBendArgs()).toHaveLength(6);
    expect(page.width).toBeGreaterThan(0);
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

describe('processWith even margins', () => {
  // A book page whose text block runs close to its left edge: 30 rows of bars from x 40 to 490 on a 600 px page.
  const squeezed: Source = {
    width: 600,
    height: 800,
    pixel: (x, y) => {
      const r = Math.floor((y - 60) / 22);
      const inRow = r >= 0 && r < 30 && (y - 60) % 22 < 10;
      const word = (x - 40) % 57;
      return inRow && x >= 40 && x < 490 && word < 51 ? 25 : 230;
    },
  };

  it('centres a photographed page\'s text between even margins, padding the thin side', async () => {
    vi.mocked(evenMargins).mockClear();
    const { page } = await processWith(fakeKit(squeezed), new Blob(), FULL_QUAD, 'original');
    const [call] = vi.mocked(evenMargins).mock.calls;
    const { width, height } = call[0];
    expect(page.height).toBe(height);
    expect(page.width).toBeGreaterThan(width + 50);
  });

  it('leaves a PDF sheet as it was printed, margins and all', async () => {
    vi.mocked(evenMargins).mockClear();
    await processWith(fakeKit(squeezed), new Blob(), FULL_QUAD, 'original', false);
    expect(evenMargins).not.toHaveBeenCalled();
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

describe('splitWith', () => {
  const spine = { top: 0.5, bottom: 0.5 };

  it('reads a copy no longer than 1000 px for the spine the person placed', async () => {
    const sizes: number[] = [];
    const kit = fakeKit(gray(3000, 2000));
    const surface = kit.surface;
    kit.surface = (w, h) => { sizes.push(Math.max(w, h)); return surface(w, h); };
    const quads = await splitWith(kit, new Blob(), spine);
    expect(quads).toHaveLength(2);
    expect(spreadQuads).toHaveBeenLastCalledWith(expect.objectContaining({ width: 1000, height: 667 }), spine);
    expect(sizes).toEqual([1000]);
  });

  it('keeps every corner on the picture, where the corner editor can reach it', async () => {
    const off = [{ x: -0.04, y: 1.03 }, { x: 0.5, y: -0.02 }, { x: 1.06, y: 0.5 }, { x: 0.5, y: 0.5 }] as Quad;
    vi.mocked(spreadQuads).mockReturnValueOnce([off, off]);
    const quads = await splitWith(fakeKit(gray(400, 300)), new Blob(), spine);
    for (const { x, y } of quads.flat()) {
      expect(Math.min(x, y)).toBeGreaterThanOrEqual(0);
      expect(Math.max(x, y)).toBeLessThanOrEqual(1);
    }
    expect(quads[0][0]).toEqual({ x: 0, y: 1 });
  });

  it('lets go of the decoded photo and the canvas', async () => {
    await splitWith(fakeKit(gray(400, 300)), new Blob(), spine);
    expect(freed).toBe(made);
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

describe('traceWith', () => {
  const quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }] as Quad;

  it('hands traceSides a gray copy 1536 px on its long edge, and the quad as it came', async () => {
    const sides = [[], [], [], []];
    vi.mocked(traceSides).mockReturnValueOnce(sides as never);
    expect(await traceWith(fakeKit(gray(4000, 3000)), new Blob(), quad)).toBe(sides);
    const [image, passed] = vi.mocked(traceSides).mock.lastCall!;
    expect([image.width, image.height, image.data.length]).toEqual([1536, 1152, 1536 * 1152]);
    expect(passed).toBe(quad);
  });

  it('passes null pins when none are given, and the pins it was given unchanged', async () => {
    await traceWith(fakeKit(gray(400, 300)), new Blob(), quad);
    expect(vi.mocked(traceSides).mock.lastCall![2]).toBeNull();
    const pins = [[{ k: 0.5, at: { x: 0.2, y: 0.3 } }], [], [], []] as never;
    await traceWith(fakeKit(gray(400, 300)), new Blob(), quad, pins);
    expect(vi.mocked(traceSides).mock.lastCall![2]).toBe(pins);
  });

  it('keeps a picture smaller than that at its own size', async () => {
    await traceWith(fakeKit(gray(400, 300)), new Blob(), quad);
    expect(vi.mocked(traceSides).mock.lastCall![0]).toMatchObject({ width: 400, height: 300 });
  });

  it('lets go of the decoded photo and the canvas', async () => {
    await traceWith(fakeKit(gray(400, 300)), new Blob(), quad);
    expect(freed).toBe(made);
  });
});
