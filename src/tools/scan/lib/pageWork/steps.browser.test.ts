import { afterEach, describe, expect, it, vi } from 'vitest';
import { photo as paperPhoto, quarter, textRows } from '#lib/pageEnhance/dewarp/orientation.test-helper.ts';
import { type Quad } from '#lib/pageEnhance/quad.ts';
import type { Pins } from '../edges/follow.ts';
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

const JPEG_STAGE_TOLERANCE = 2;

interface Encoded { width: number; height: number; type: string; quality: number }
let encodes: Encoded[] = [];
let surfaces: { width: number; height: number }[] = [];
let freed = 0;

const kit: CanvasKit = {
  surface(width, height) {
    surfaces.push({ width, height });
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    return {
      canvas,
      ctx,
      toBlob: (type, quality) => {
        encodes.push({ width, height, type, quality });
        return canvas.convertToBlob({ type, quality });
      },
      free: () => {
        freed += 1;
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  },
  async decode(blob) {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  },
};

type Pixel = (x: number, y: number) => [number, number, number];

const photoOf = async (width: number, height: number, pixel: Pixel) => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) image.data.set([...pixel(x, y), 255], (y * width + x) * 4);
  }
  ctx.putImageData(image, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
};

const gray = async (width: number, height: number) => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.fillStyle = 'rgb(128, 128, 128)';
  ctx.fillRect(0, 0, width, height);
  return canvas.convertToBlob({ type: 'image/png' });
};

const drawnOnDesk = (width: number, height: number, paint: (ctx: OffscreenCanvasRenderingContext2D) => void) => {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.fillStyle = '#2b2118';
  ctx.fillRect(0, 0, width, height);
  paint(ctx);
  return canvas.convertToBlob({ type: 'image/png' });
};

const decodedPixel = async (blob: Blob, x: number, y: number) => {
  const bitmap = await createImageBitmap(blob);
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(x, y, 1, 1).data[0];
};

afterEach(() => {
  encodes = [];
  surfaces = [];
  freed = 0;
  vi.mocked(measureBend).mockClear();
  vi.mocked(traceSides).mockClear();
  vi.mocked(curvesFromSides).mockClear();
});

describe('processWith', () => {
  it('crops a photo inside its corners, and never a PDF sheet: its corners are exact and its print can run to the edge', async () => {
    const photo = await processWith(kit, await gray(400, 300), FULL_QUAD, 'original');
    const sheet = await processWith(kit, await gray(400, 300), FULL_QUAD, 'original', false);
    expect([photo.page.width, photo.page.height]).toEqual([394, 295]);
    expect([sheet.page.width, sheet.page.height]).toEqual([400, 300]);
  });

  it('reads paper edges on a photo, and none on a PDF sheet', async () => {
    await processWith(kit, await gray(400, 300), FULL_QUAD, 'original');
    await processWith(kit, await gray(400, 300), FULL_QUAD, 'original', false);
    expect(vi.mocked(measureBend).mock.calls.map((call) => call[5])).toEqual([true, false]);
  });

  it('flattens a flat page by its corners alone: no bend, nothing to report, every canvas freed', async () => {
    const { page, measureError } = await processWith(kit, await gray(400, 300), FULL_QUAD, 'original');
    expect(measureError).toBeNull();
    expect(page.bentPx).toBe(0);
    expect([page.width, page.height]).toEqual([394, 295]);
    expect(encodes).toEqual([
      { width: 394, height: 295, type: 'image/jpeg', quality: 0.92 },
      { width: 394, height: 295, type: 'image/jpeg', quality: 0.8 },
    ]);
    expect(freed).toBe(surfaces.length);
  });

  it('hands back a measuring failure with the page, flattened by its corners', async () => {
    const error = new Error('measure failed');
    // forced: a measuring step that throws, which no photo makes it do
    vi.mocked(measureBend).mockImplementationOnce(() => { throw error; });
    const { page, measureError } = await processWith(kit, await gray(400, 300), FULL_QUAD, 'original');
    expect(measureError).toBe(error);
    expect(page.bentPx).toBe(0);
    expect(page.width).toBe(394);
  });
});

describe('processWith traced border', () => {
  const INNER: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
  const PINS: Pins = [[{ k: 0.5, at: { x: 0.5, y: 0.12 } }], [], [], []];
  const lastBendArgs = () => vi.mocked(measureBend).mock.calls.at(-1)!;

  it('hands the bend measure the curves traced from the sides the editor draws, so the flattening follows the drawn border', async () => {
    const bowed = await drawnOnDesk(600, 800, (ctx) => {
      ctx.fillStyle = '#f2efe6';
      ctx.beginPath();
      ctx.moveTo(60, 80);
      ctx.quadraticCurveTo(300, 20, 540, 80);
      ctx.lineTo(540, 720);
      ctx.quadraticCurveTo(300, 780, 60, 720);
      ctx.closePath();
      ctx.fill();
    });
    await processWith(kit, bowed, INNER, 'original', true, PINS, true);
    const sides = vi.mocked(traceSides).mock.results[0].value;
    const curves = vi.mocked(curvesFromSides).mock.results[0].value;
    expect(curves).not.toBeNull();
    expect(curvesFromSides).toHaveBeenCalledWith(INNER, sides, 600, 800);
    expect(lastBendArgs()[6]).toBe(curves);
  });

  it('traces on the gray copy at the trace size, with the page quad and its pins', async () => {
    await processWith(kit, await gray(3000, 2000), INNER, 'original', true, PINS, true);
    const [image, quad, pins] = vi.mocked(traceSides).mock.calls[0];
    expect([image.width, image.height]).toEqual([1536, 1024]);
    expect(quad).toBe(INNER);
    expect(pins).toBe(PINS);
  });

  it('gives the bend measure no traced border for the whole picture, in any corner order, and never traces it', async () => {
    const [tl, tr, br, bl] = FULL_QUAD;
    for (const quad of [FULL_QUAD, [bl, tl, tr, br], [br, bl, tl, tr]] as Quad[]) {
      await processWith(kit, await gray(400, 300), quad, 'original');
    }
    expect(traceSides).not.toHaveBeenCalled();
    expect(vi.mocked(measureBend).mock.calls.every((call) => call.length === 6)).toBe(true);
  });

  it('traces a fine PDF sheet with an inner quad too: paperEdges only means the inset crop', async () => {
    await processWith(kit, await gray(400, 300), INNER, 'original', false, null, true);
    expect(traceSides).toHaveBeenCalledTimes(1);
    expect(lastBendArgs()[5]).toBe(false);
    expect(lastBendArgs()).toHaveLength(7);
  });

  it('does not trace a page that is not fine, with or without pins: the straight lines stand, and the bend is measured as before', async () => {
    // Protects: the traced border is used only once the person turned Fine-tune edges on; pins alone do not trace.
    await processWith(kit, await gray(400, 300), INNER, 'original', false, null, false);
    await processWith(kit, await gray(400, 300), INNER, 'original', false, PINS, false);
    expect(traceSides).not.toHaveBeenCalled();
    expect(vi.mocked(measureBend).mock.calls.every((call) => call.length === 6)).toBe(true);
  });

  it('traces a fine page with its pins', async () => {
    // Protects: Fine-tune edges on follows the pinned border.
    await processWith(kit, await gray(400, 300), INNER, 'original', false, PINS, true);
    expect(traceSides).toHaveBeenCalledTimes(1);
    expect(lastBendArgs()).toHaveLength(7);
  });

  it('traces a fine page, and still never the whole picture, whatever fine says', async () => {
    await processWith(kit, await gray(400, 300), INNER, 'original', true, null, true);
    expect(traceSides).toHaveBeenCalledTimes(1);
    await processWith(kit, await gray(400, 300), FULL_QUAD, 'original', true, PINS, true);
    expect(traceSides).toHaveBeenCalledTimes(1);
  });

  it('still produces the page when tracing throws, measures it as before, and hands the error back to be reported', async () => {
    const error = new Error('trace failed');
    // forced: a trace that throws, which no photo makes it do
    vi.mocked(traceSides).mockImplementationOnce(() => { throw error; });
    const { page, measureError } = await processWith(kit, await gray(400, 300), INNER, 'original', true, null, true);
    expect(measureError).toBe(error);
    expect(lastBendArgs()).toHaveLength(6);
    expect(page.width).toBeGreaterThan(0);
  });
});

describe('processWith folded corners', () => {
  it('paints the dark triangle a pinned sheet leaves in a corner in the paper colour', async () => {
    const [w, h] = [400, 300];
    const photo = await photoOf(w, h, (x, y) => (w - 1 - x + y <= 60 ? [20, 20, 20] : [230, 230, 230]));
    const { page } = await processWith(kit, photo, FULL_QUAD, 'original');
    expect(Math.abs((await decodedPixel(page.blob, page.width - 1, 0)) - 230)).toBeLessThanOrEqual(JPEG_STAGE_TOLERANCE);
  });
});

describe('processWith even margins', () => {
  // A book page whose text block runs close to its left edge: 30 rows of bars from x 40 to 490 on a 600 px page.
  const squeezed = () => photoOf(600, 800, (x, y) => {
    const r = Math.floor((y - 60) / 22);
    const inRow = r >= 0 && r < 30 && (y - 60) % 22 < 10;
    const word = (x - 40) % 57;
    return inRow && x >= 40 && x < 490 && word < 51 ? [25, 25, 25] : [230, 230, 230];
  });

  it('centres a photographed page\'s text between even margins, padding the thin side', async () => {
    vi.mocked(evenMargins).mockClear();
    const { page } = await processWith(kit, await squeezed(), FULL_QUAD, 'original');
    expect(evenMargins).toHaveBeenCalledTimes(1);
    const [call] = vi.mocked(evenMargins).mock.calls;
    const { width, height } = call[0];
    expect(page.height).toBe(height);
    expect(page.width).toBeGreaterThan(width + 50);
  });

  it('leaves a PDF sheet as it was printed, margins and all', async () => {
    vi.mocked(evenMargins).mockClear();
    await processWith(kit, await squeezed(), FULL_QUAD, 'original', false);
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
    const { page } = await processWith(kit, await gray(W, H), quad, 'original');
    expect(Math.max(page.width, page.height) / Math.min(page.width, page.height)).toBeCloseTo(Math.SQRT2, 2);
  });
});

describe('splitWith', () => {
  const spine = { top: 0.5, bottom: 0.5 };

  it('reads a copy no longer than 1000 px for the spine the person placed', async () => {
    const quads = await splitWith(kit, await gray(3000, 2000), spine);
    expect(quads).toHaveLength(2);
    expect(spreadQuads).toHaveBeenLastCalledWith(expect.objectContaining({ width: 1000, height: 667 }), spine);
    expect(surfaces.map(({ width, height }) => Math.max(width, height))).toEqual([1000]);
  });

  it('keeps every corner on the picture, where the corner editor can reach it', async () => {
    const [W, H, lean] = [1600, 1000, 0.06];
    const spread = await drawnOnDesk(W, H, (ctx) => {
      for (const centre of [W * 0.25, W * 0.75]) {
        ctx.save();
        ctx.translate(centre, H / 2);
        ctx.rotate(lean);
        ctx.fillStyle = '#f2efe6';
        ctx.fillRect(-W * 0.24, -H * 0.46, W * 0.48, H * 0.92);
        ctx.fillStyle = '#222222';
        for (let i = 0; i < 28; i += 1) ctx.fillRect(-W * 0.2, -H * 0.4 + i * 26, W * 0.4 - (i % 5) * 30, 8);
        ctx.restore();
      }
    });
    const quads = await splitWith(kit, spread, spine);
    const raw = vi.mocked(spreadQuads).mock.results.at(-1)!.value.flat() as { x: number; y: number }[];
    expect(raw.some(({ x, y }) => Math.min(x, y) < 0 || Math.max(x, y) > 1)).toBe(true);
    quads.flat().forEach(({ x, y }, i) => {
      expect(Math.min(x, y)).toBeGreaterThanOrEqual(0);
      expect(Math.max(x, y)).toBeLessThanOrEqual(1);
      expect([x, y]).toEqual([raw[i].x, raw[i].y].map((n) => Math.min(1, Math.max(0, n))));
    });
  });

  it('lets go of the decoded photo and the canvas', async () => {
    await splitWith(kit, await gray(400, 300), spine);
    expect(freed).toBe(surfaces.length);
  });
});

describe('inspectWith', () => {
  it('makes a preview no longer than 1600 px and reports the photo\'s own size', async () => {
    const inspected = await inspectWith(kit, await gray(4000, 3000));
    expect([inspected.width, inspected.height]).toEqual([4000, 3000]);
    expect(encodes[0]).toEqual({ width: 1600, height: 1200, type: 'image/jpeg', quality: 0.85 });
    expect(freed).toBe(surfaces.length);
  });

  it('reads the turn of a photo with no corners from its whole frame', async () => {
    const turned = quarter(paperPhoto(textRows(30, 1)));
    const inspected = await inspectWith(kit, await photoOf(turned.width, turned.height, (x, y) => {
      const v = turned.data[y * turned.width + x];
      return [v, v, v];
    }));
    expect(inspected.quad).toBeNull();
    expect(vi.mocked(uprightTurns).mock.lastCall?.[1]).toEqual(FULL_QUAD);
    expect(inspected.turns).toBe(3);
  });
});

describe('traceWith', () => {
  const quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }] as Quad;

  it('hands traceSides a gray copy 1536 px on its long edge, and the quad as it came', async () => {
    const sides = await traceWith(kit, await gray(4000, 3000), quad);
    const [image, passed] = vi.mocked(traceSides).mock.lastCall!;
    expect(sides).toBe(vi.mocked(traceSides).mock.results[0].value);
    expect([image.width, image.height, image.data.length]).toEqual([1536, 1152, 1536 * 1152]);
    expect(passed).toBe(quad);
  });

  it('passes null pins when none are given, and the pins it was given unchanged', async () => {
    await traceWith(kit, await gray(400, 300), quad);
    expect(vi.mocked(traceSides).mock.lastCall![2]).toBeNull();
    const pins = [[{ k: 0.5, at: { x: 0.2, y: 0.3 } }], [], [], []] as never;
    await traceWith(kit, await gray(400, 300), quad, pins);
    expect(vi.mocked(traceSides).mock.lastCall![2]).toBe(pins);
  });

  it('keeps a picture smaller than that at its own size', async () => {
    await traceWith(kit, await gray(400, 300), quad);
    expect(vi.mocked(traceSides).mock.lastCall![0]).toMatchObject({ width: 400, height: 300 });
  });

  it('lets go of the decoded photo and the canvas', async () => {
    await traceWith(kit, await gray(400, 300), quad);
    expect(freed).toBe(surfaces.length);
  });
});
