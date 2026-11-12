import { describe, expect, it, vi } from 'vitest';
import { gray, leaning } from '#lib/pageEnhance/leaning.test-helper.ts';
import type { Book } from '#lib/pageEnhance/photoPage.ts';
import type { GrayImage } from '#lib/pageEnhance/quad.ts';
import { onTable, textPage } from '#lib/pageEnhance/textPage.test-helper.ts';
import { pdfSheets, readsRightToLeft, type PdfSheet, type SheetBorder, type SheetReader } from './pdfSheets.ts';
import { FULL_QUAD } from './quad.ts';

// What textTurn would say about a sideways sheet: the synthetic bars are no text, so a tall picture of a wide
// sheet is declared sideways here and everything else is the real assess.
let nextTurn = () => 1;
vi.mock('#lib/pageEnhance/plan.ts', async (importActual) => {
  const actual = await importActual<typeof import('#lib/pageEnhance/plan.ts')>();
  return { ...actual, assess: (gray: GrayImage, book?: Book) => ({ ...actual.assess(gray, book), ...(gray.height === 800 && gray.width === 560 ? { turn: nextTurn() } : {}) }) };
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
// Two blocks of print with a wide empty gap between them and no line: worth asking about, not splitting.
function gapSheet(width: number, height: number): GrayImage {
  const data = new Uint8ClampedArray(width * height).fill(235);
  for (let y = 40; y < height - 40; y += 36) {
    for (let x = 30; x < width - 30; x += 1) if (Math.abs(x - width / 2) > 50) for (let k = 0; k < 10; k += 1) data[(y + k) * width + x] = 50;
  }
  return { width, height, data };
}
const blank = (width: number, height: number): GrayImage => ({ width, height, data: new Uint8ClampedArray(width * height).fill(235) });

interface Calls { gray: [number, number, number][]; jpeg: [number, number, number, SheetBorder][]; closed: boolean }
/** A two-page sheet whose justified rows lean by `degrees`. */
function tiltedSpread(width: number, height: number, degrees: number): GrayImage {
  const half = gray(leaning(width / 2, height, degrees, 40, width / 2 - 40));
  const data = new Uint8ClampedArray(width * height).fill(255);
  for (let y = 0; y < height; y += 1) {
    for (const start of [0, width / 2]) data.set(half.data.subarray(y * half.width, (y + 1) * half.width), y * width + start);
    data.fill(0, y * width + width / 2 - 2, y * width + width / 2 + 2);
  }
  return { width, height, data };
}

function reader(images: (turns: number) => GrayImage, { pages = 1, rtl = false as boolean | null } = {}): SheetReader & { calls: Calls } {
  const calls: Calls = { gray: [], jpeg: [], closed: false };
  return {
    calls,
    pageCount: pages,
    rightToLeft: async () => rtl,
    grayOf: async (n, long, turns) => { calls.gray.push([n, long, turns]); return images(turns); },
    jpegOf: async (n, long, turns, border) => { calls.jpeg.push([n, long, turns, border]); const g = images(turns); return { blob: new Blob(['x'], { type: 'image/jpeg' }), width: g.width, height: g.height }; },
    close: () => { calls.closed = true; },
  };
}
/** Two pages of lines either side of a spine, every fourth line short and pushed to `side`. */
function linedSpread(side: 'left' | 'right'): GrayImage {
  const width = 1000;
  const height = 700;
  const data = new Uint8ClampedArray(width * height).fill(255);
  for (const [left, right] of [[60, 440], [560, 940]]) {
    for (let row = 0, y = 40; y < height - 40; row += 1, y += 14) {
      const short = row % 4 === 3;
      const from = short && side === 'right' ? right - 150 : left;
      const to = short && side === 'left' ? left + 150 : right;
      for (let dy = 0; dy < 7; dy += 1) data.fill(0, (y + dy) * width + from, (y + dy) * width + to);
    }
  }
  for (let y = 0; y < height; y += 1) data.fill(0, y * width + 499, y * width + 502);
  return { width, height, data };
}

const collect = async (it: AsyncGenerator<PdfSheet>) => { const out: PdfSheet[] = []; for await (const s of it) out.push(s); return out; };
const pdf = new File(['%PDF'], 'book.pdf', { type: 'application/pdf' });

describe('a sheet with no text to read', () => {
  const firstPageIsOnTheRight = (sheet: PdfSheet) => sheet.quads[0][0].x > 0.4;

  it('reads its direction from where its short lines sit', async () => {
    const [hebrew] = await collect(pdfSheets(pdf, undefined, reader(() => linedSpread('right'), { rtl: null })));
    const [latin] = await collect(pdfSheets(pdf, undefined, reader(() => linedSpread('left'), { rtl: null })));
    expect(firstPageIsOnTheRight(hebrew)).toBe(true);
    expect(firstPageIsOnTheRight(latin)).toBe(false);
  });

  it('goes by the text when there is text, whatever the lines show', async () => {
    const [sheet] = await collect(pdfSheets(pdf, undefined, reader(() => linedSpread('right'), { rtl: false })));
    expect(firstPageIsOnTheRight(sheet)).toBe(false);
  });
});

describe('readsRightToLeft', () => {
  it('is true for Hebrew and Arabic, false for Latin and empty text', () => {
    expect(readsRightToLeft('שלום')).toBe(true);
    expect(readsRightToLeft('abc مرحبا')).toBe(true);
    expect(readsRightToLeft('hello 123')).toBe(false);
    expect(readsRightToLeft('')).toBe(false);
  });
});

describe('pdfSheets', () => {
  it('gives a tilted sheet a border so every corner sits on the picture, where the corner editor can reach it', async () => {
    const r = reader(() => tiltedSpread(1000, 700, 3.5));
    const [sheet] = await collect(pdfSheets(pdf, undefined, r));
    expect(sheet.quads).toHaveLength(2);
    for (const { x, y } of sheet.quads.flat()) {
      expect(Math.min(x, y)).toBeGreaterThanOrEqual(0);
      expect(Math.max(x, y)).toBeLessThanOrEqual(1);
    }
    const border = r.calls.jpeg[0][3];
    expect(Math.max(border.left, border.top, border.right, border.bottom)).toBeGreaterThan(0);
  });

  it('leaves room on every side of a crooked sheet, so flattening a bent page never reaches past the picture', async () => {
    const r = reader(() => tiltedSpread(1000, 700, 3.5));
    await collect(pdfSheets(pdf, undefined, r));
    const { left, top, right, bottom } = r.calls.jpeg[0][3];
    expect(Math.min(left, top, right, bottom)).toBeGreaterThanOrEqual(0.05);
  });

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

  it('keeps an unsure sheet whole, with the question and a border for a split to level into', async () => {
    const r = reader(() => gapSheet(800, 560), { rtl: true });
    const [sheet] = await collect(pdfSheets(pdf, undefined, r));
    expect(sheet.quads).toHaveLength(1);
    expect(sheet.question?.rightToLeft).toBe(true);
    const { top, bottom } = sheet.question!.spine;
    expect(top).toBeGreaterThan(0.3);
    expect(bottom).toBeLessThan(0.7);
    const border = r.calls.jpeg[0][3];
    expect(Math.min(border.left, border.top, border.right, border.bottom)).toBeGreaterThanOrEqual(0.05);
  });

  it('asks nothing of a sure spread, or of a single page', async () => {
    const [spreadSheet] = await collect(pdfSheets(pdf, undefined, reader(() => spread(800, 560))));
    expect(spreadSheet.question).toBeNull();
    const [single] = await collect(pdfSheets(pdf, undefined, reader(() => blank(600, 800))));
    expect(single.question).toBeNull();
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
    expect(r.calls.jpeg.map((call) => call.slice(0, 3))).toEqual([[1, 3200, 0]]);
  });

  it('redraws a sheet by the turns its read asks for, not always the same one', async () => {
    nextTurn = () => 3;
    const r = reader((turns) => (turns === 0 ? turnedAside(spread(800, 560)) : spread(800, 560)));
    const [sheet] = await collect(pdfSheets(pdf, undefined, r));
    nextTurn = () => 1;
    expect(r.calls.jpeg[0][2]).toBe(3);
    expect(sheet.quads).toHaveLength(2);
  });

  it('keeps a spread split when the read after the first turn says it is upside down', async () => {
    const asks = [1, 2];
    nextTurn = () => asks.shift() ?? 0;
    const r = reader((turns) => (turns === 3 ? spread(800, 560) : turnedAside(spread(800, 560))));
    const [sheet] = await collect(pdfSheets(pdf, undefined, r));
    nextTurn = () => 1;
    expect(r.calls.gray.map((c) => c[2])).toEqual([0, 1, 3]);
    expect(sheet.quads).toHaveLength(2);
  });

  it('redraws a sideways sheet turned, and plans from the upright read', async () => {
    // Turned a quarter, the spread reads upright; at no turn the same sheet is its sideways picture.
    const sideways = (turns: number) => (turns === 0 ? turnedAside(spread(800, 560)) : spread(800, 560));
    const r = reader(sideways);
    const [sheet] = await collect(pdfSheets(pdf, undefined, r));
    expect(r.calls.gray.map((c) => c[2])).toEqual([0, 1]);
    expect(r.calls.jpeg.map((call) => call.slice(0, 3))).toEqual([[1, 3200, 1]]);
    expect(sheet.quads).toHaveLength(2);
  });

  // SCAN-69: a book is photographed or scanned as a whole, so a sheet whose own border is paper reads as a photo too.
  it('reads each sheet with the book of the sheets before it', async () => {
    const sheets = [onTable(textPage()), onTable(textPage()), textPage()];
    const r = reader(() => textPage(), { pages: 3 });
    r.grayOf = async (n) => sheets[n - 1];
    const [, , inBook] = await collect(pdfSheets(pdf, undefined, r));
    const [alone] = await collect(pdfSheets(pdf, undefined, reader(() => textPage())));
    expect(alone.quads[0][0].x).toBeLessThan(0.05);
    expect(inBook.quads[0][0].x).toBeGreaterThan(0.05);
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
