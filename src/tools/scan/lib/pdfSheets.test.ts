import { describe, expect, it, vi } from 'vitest';
import type { GrayImage } from '#lib/pageEnhance/quad.ts';
import { pdfSheets, readsRightToLeft, type PdfSheet, type SheetReader } from './pdfSheets.ts';
import { FULL_QUAD } from './quad.ts';

// What textTurn would say about a sideways sheet: the synthetic bars are no text, so a tall picture of a wide
// sheet is declared sideways here and everything else is the real assess.
vi.mock('#lib/pageEnhance/plan.ts', async (importActual) => {
  const actual = await importActual<typeof import('#lib/pageEnhance/plan.ts')>();
  return { ...actual, assess: (gray: GrayImage) => ({ ...actual.assess(gray), ...(gray.height === 800 && gray.width === 560 ? { turn: 1 as const } : {}) }) };
});

// A white sheet with a dark spine down the middle and rows of dark bars either side: a two-page spread.
function spread(width: number, height: number): GrayImage {
  const data = new Uint8ClampedArray(width * height).fill(235);
  for (let y = 0; y < height; y += 1) for (const x of [width / 2 - 1, width / 2]) data[y * width + x] = 40;
  for (let y = 40; y < height - 40; y += 36) {
    for (let x = 30; x < width - 30; x += 1) if (Math.abs(x - width / 2) > 30) for (let k = 0; k < 10; k += 1) data[(y + k) * width + x] = 50;
  }
  return { width, height, data };
}
const blank = (width: number, height: number): GrayImage => ({ width, height, data: new Uint8ClampedArray(width * height).fill(235) });

interface Calls { gray: [number, number, number][]; jpeg: [number, number, number][]; closed: boolean }
function reader(images: (turns: number) => GrayImage, { pages = 1, rtl = false } = {}): SheetReader & { calls: Calls } {
  const calls: Calls = { gray: [], jpeg: [], closed: false };
  return {
    calls,
    pageCount: pages,
    rightToLeft: async () => rtl,
    grayOf: async (n, long, turns) => { calls.gray.push([n, long, turns]); return images(turns); },
    jpegOf: async (n, long, turns) => { calls.jpeg.push([n, long, turns]); const g = images(turns); return { blob: new Blob(['x'], { type: 'image/jpeg' }), width: g.width, height: g.height }; },
    close: () => { calls.closed = true; },
  };
}
const collect = async (it: AsyncGenerator<PdfSheet>) => { const out: PdfSheet[] = []; for await (const s of it) out.push(s); return out; };
const pdf = new File(['%PDF'], 'book.pdf', { type: 'application/pdf' });

describe('readsRightToLeft', () => {
  it('is true for Hebrew and Arabic, false for Latin and empty text', () => {
    expect(readsRightToLeft('שלום')).toBe(true);
    expect(readsRightToLeft('abc مرحبا')).toBe(true);
    expect(readsRightToLeft('hello 123')).toBe(false);
    expect(readsRightToLeft('')).toBe(false);
  });
});

describe('pdfSheets', () => {
  it('gives a spread two quads, left page first, and names the file by pdf and page', async () => {
    const r = reader(() => spread(800, 560));
    const [sheet] = await collect(pdfSheets(pdf, undefined, r));
    expect(sheet.file.name).toBe('book-1.jpg');
    expect(sheet.file.type).toBe('image/jpeg');
    expect(sheet.quads).toHaveLength(2);
    const [left, right] = sheet.quads;
    expect(Math.max(...left.map((p) => p.x))).toBeLessThan(Math.min(...right.map((p) => p.x)) + 0.05);
    expect(left[0].x).toBeLessThan(right[0].x);
    expect(r.calls.closed).toBe(true);
  });

  it('reverses a right-to-left sheet so the right page comes first', async () => {
    const [sheet] = await collect(pdfSheets(pdf, undefined, reader(() => spread(800, 560), { rtl: true })));
    expect(sheet.quads[0][0].x).toBeGreaterThan(sheet.quads[1][0].x);
  });

  it('gives a single page one quad', async () => {
    const [sheet] = await collect(pdfSheets(pdf, undefined, reader(() => blank(600, 800))));
    expect(sheet.quads).toHaveLength(1);
    expect(sheet.quads[0]).toEqual(FULL_QUAD);
  });

  it('draws the small read, then the full sheet at the source long edge', async () => {
    const r = reader(() => blank(600, 800));
    await collect(pdfSheets(pdf, undefined, r));
    expect(r.calls.gray).toEqual([[1, 1000, 0]]);
    expect(r.calls.jpeg).toEqual([[1, 3200, 0]]);
  });

  it('redraws a sideways sheet turned, and plans from the upright read', async () => {
    // Turned a quarter, the spread reads upright; at no turn the same sheet is its sideways picture.
    const sideways = (turns: number) => (turns === 0 ? turnedAside(spread(800, 560)) : spread(800, 560));
    const r = reader(sideways);
    const [sheet] = await collect(pdfSheets(pdf, undefined, r));
    expect(r.calls.gray.map((c) => c[2])).toEqual([0, 1]);
    expect(r.calls.jpeg).toEqual([[1, 3200, 1]]);
    expect(sheet.quads).toHaveLength(2);
  });

  it('stops when the signal is aborted', async () => {
    const controller = new AbortController();
    const r = reader(() => blank(600, 800), { pages: 3 });
    const got: unknown[] = [];
    await expect((async () => {
      for await (const s of pdfSheets(pdf, controller.signal, r)) { got.push(s); controller.abort(); }
    })()).rejects.toMatchObject({ name: 'AbortError' });
    expect(got).toHaveLength(1);
    expect(r.calls.closed).toBe(true);
  });
});

/** The picture turned a quarter anticlockwise, as a sheet that arrived sideways. */
function turnedAside({ width, height, data }: GrayImage): GrayImage {
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) out[(width - 1 - x) * height + y] = data[y * width + x];
  return { width: height, height: width, data: out };
}
