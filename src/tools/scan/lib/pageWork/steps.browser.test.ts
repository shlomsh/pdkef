import { afterEach, describe, expect, it, vi } from 'vitest';
import { photo as paperPhoto, quarter, textRows } from '#lib/pageEnhance/dewarp/orientation.test-helper.ts';
import { type Quad } from '#lib/pageEnhance/quad.ts';
import type { Pins } from '../edges/follow.ts';
import { FULL_QUAD } from '../quad.ts';
import { inspectWith, processWith, splitWith, traceWith, type CanvasKit } from './steps.ts';

// The real modules run; the spies show what they were handed.
vi.mock('#lib/pageEnhance/plan.ts', { spy: true });
vi.mock('./upright.ts', { spy: true });
vi.mock('../edges/follow.ts', { spy: true });
import { spreadQuads } from '#lib/pageEnhance/plan.ts';
import { uprightTurns } from './upright.ts';
import { traceSides } from '../edges/follow.ts';

interface Encoded { width: number; height: number; type: string; quality: number }
let encodes: Encoded[] = [];
let surfaces: { width: number; height: number }[] = [];
let freed = 0;
let emptyNext = false;

const kit: CanvasKit = {
  surface(width, height) {
    surfaces.push({ width, height });
    const canvas = new OffscreenCanvas(width, height);
    if (emptyNext) {
      emptyNext = false;
      canvas.width = 0;
      canvas.height = 0;
    }
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

const redOf = async (blob: Blob, x: number, y: number) => {
  const bitmap = await createImageBitmap(blob);
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(x, y, 1, 1).data[0];
};

const fresh = () => {
  emptyNext = false;
  encodes = [];
  surfaces = [];
  freed = 0;
  vi.mocked(traceSides).mockClear();
};
afterEach(fresh);

const INNER: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
const PINS: Pins = [[{ k: 0.5, at: { x: 0.5, y: 0.12 } }], [], [], []];

describe('processWith', () => {
  it('flattens a flat page by its corners alone: no bend, nothing to report, every canvas freed, and traces on the gray copy at the trace size, with the page quad and its pins, and not when the page is not fine', async () => {
    const { page, measureError } = await processWith(kit, await gray(400, 300), FULL_QUAD, 'original');
    expect(measureError, 'measure error').toBeNull();
    expect(page.bentPx, 'bend').toBe(0);
    expect([page.width, page.height], 'page size').toEqual([394, 295]);
    expect(encodes, 'encodes').toEqual([
      { width: 394, height: 295, type: 'image/jpeg', quality: 0.92 },
      { width: 394, height: 295, type: 'image/jpeg', quality: 0.8 },
    ]);
    expect(freed, 'canvases freed').toBe(surfaces.length);

    const sheet = await processWith(kit, await gray(400, 300), FULL_QUAD, 'original', false);
    expect([sheet.page.width, sheet.page.height], 'a PDF sheet is not cropped').toEqual([400, 300]);

    const coloured = await photoOf(400, 300, () => [200, 100, 50]);
    const original = await processWith(kit, coloured, FULL_QUAD, 'original');
    const grayscale = await processWith(kit, coloured, FULL_QUAD, 'grayscale');
    const [keptRed, grayRed] = [await redOf(original.page.blob, 200, 150), await redOf(grayscale.page.blob, 200, 150)];
    expect(Math.abs(keptRed - grayRed), 'the look given changes the pixels').toBeGreaterThan(40);

    fresh();
    emptyNext = true;
    const unread = await processWith(kit, await gray(400, 300), INNER, 'original', true, null, true);
    expect(unread.measureError, 'the gray read failed').toBeInstanceOf(Error);
    expect(unread.page.width, 'the page is still made').toBeGreaterThan(0);

    fresh();
    await processWith(kit, await gray(3000, 2000), INNER, 'original', true, PINS, true);
    const [image, quad, pins] = vi.mocked(traceSides).mock.calls[0];
    expect([image.width, image.height], 'trace size').toEqual([1536, 1024]);
    expect(quad, 'trace quad').toBe(INNER);
    expect(pins, 'trace pins').toBe(PINS);
    await processWith(kit, await gray(400, 300), INNER, 'original', false, PINS, false);
    expect(traceSides, 'fine=false on an inner quad').toHaveBeenCalledTimes(1);
  });
});

describe('splitWith and inspectWith', () => {
  const spine = { top: 0.5, bottom: 0.5 };

  it('splitWith reads a copy no longer than 1000 px for the spine the person placed, and lets go of the decoded photo and the canvas, and inspectWith makes a preview no longer than 1600 px, reports the photo\'s own size, and frees what it made', async () => {
    const quads = await splitWith(kit, await gray(3000, 2000), spine);
    expect(quads, 'split quads').toHaveLength(2);
    expect(spreadQuads, 'spine read').toHaveBeenLastCalledWith(expect.objectContaining({ width: 1000, height: 667 }), spine);
    expect(surfaces.map(({ width, height }) => Math.max(width, height)), 'split surfaces').toEqual([1000]);
    expect(freed, 'split freed').toBe(surfaces.length);

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
    const held = await splitWith(kit, spread, spine);
    const raw = vi.mocked(spreadQuads).mock.results.at(-1)!.value.flat() as { x: number; y: number }[];
    expect(raw.some(({ x, y }) => Math.min(x, y) < 0 || Math.max(x, y) > 1), 'a leaning spread reads corners off the picture').toBe(true);
    held.flat().forEach(({ x, y }, i) => {
      expect([x, y], 'corner held on the picture').toEqual([raw[i].x, raw[i].y].map((n) => Math.min(1, Math.max(0, n))));
    });

    fresh();
    const inspected = await inspectWith(kit, await gray(4000, 3000));
    expect([inspected.width, inspected.height], 'inspected size').toEqual([4000, 3000]);
    expect(encodes[0], 'preview encode').toEqual({ width: 1600, height: 1200, type: 'image/jpeg', quality: 0.85 });
    expect(freed, 'inspect freed').toBe(surfaces.length);
  });

  it('inspectWith reads the turn of a photo with no corners from its whole frame', async () => {
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
  const quad = INNER;

  it('hands traceSides a gray copy 1536 px on its long edge and the quad as it came, a smaller picture at its own size, null pins or the pins given, and frees what it made', async () => {
    const sides = await traceWith(kit, await gray(4000, 3000), quad);
    const [image, passed] = vi.mocked(traceSides).mock.lastCall!;
    expect(sides).toBe(vi.mocked(traceSides).mock.results[0].value);
    expect([image.width, image.height, image.data.length]).toEqual([1536, 1152, 1536 * 1152]);
    expect(passed).toBe(quad);
    await traceWith(kit, await gray(400, 300), quad);
    expect(vi.mocked(traceSides).mock.lastCall![0], 'a smaller picture').toMatchObject({ width: 400, height: 300 });
    expect(vi.mocked(traceSides).mock.lastCall![2], 'no pins').toBeNull();
    await traceWith(kit, await gray(400, 300), quad, PINS);
    expect(vi.mocked(traceSides).mock.lastCall![2], 'the pins given').toBe(PINS);
    expect(freed).toBe(surfaces.length);
  });
});
