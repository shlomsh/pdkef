import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// Spy-through: the real renderer needs a 2d canvas, which jsdom does not have, so the one forced line below hands
// back page pixels. The row finder (textRows.ts) and inkBounds.ts stay real and read those pixels.
vi.mock('#lib/pdf/renderPage.js', { spy: true });

import { renderPageToCanvas } from '#lib/pdf/renderPage.js';
import { readInkBounds, readPageInk } from './readInkBounds.ts';

// Five rows from 100px to 700px on an 800px canvas read back as left 0.125, right 0.875.
const ROWS = Array.from({ length: 5 }, () => ({ left: 100, right: 700 }));
const rowsOf = (n: number, left: number, right: number) => Array.from({ length: n }, () => ({ left, right }));

function fakePage(rotate = 0, width = 400) {
  return { rotate, getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: width * scale })) };
}

function fakeDoc(pages: Array<ReturnType<typeof fakePage>>, numPages = pages.length) {
  return { numPages, getPage: vi.fn(async (n: number) => pages[n - 1]) } as unknown as PDFDocumentProxy & { getPage: ReturnType<typeof vi.fn> };
}

// An 800 x 1000 white page with one solid 20px-tall ink bar per row, left to right as given.
function inkCanvas(rows: Array<{ left: number; right: number }>) {
  const width = 800;
  const height = 1000;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  rows.forEach((row, i) => {
    for (let y = 100 + i * 100; y < 120 + i * 100; y += 1) {
      for (let x = row.left; x < row.right; x += 1) data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
    }
  });
  return { width, height, getContext: () => ({ getImageData: () => ({ data, height }) }) };
}
let pageRows = ROWS;
const renderedPage = () => vi.mocked(renderPageToCanvas);
const fakeCanvas = () => inkCanvas(pageRows);

describe('readInkBounds', () => {
  beforeEach(() => {
    pageRows = ROWS;
    renderedPage().mockReset().mockImplementation(async () => fakeCanvas() as never);
  });

  it('reads the text span as fractions of the page width', async () => {
    const result = await readInkBounds(fakeDoc([fakePage()]), () => true);
    expect(result).toEqual({ left: 0.125, right: 0.875 });
  });

  it('samples at most the first five pages', async () => {
    const doc = fakeDoc(Array.from({ length: 9 }, () => fakePage()));
    await readInkBounds(doc, () => true);
    expect(doc.getPage).toHaveBeenCalledTimes(5);
    expect(renderedPage()).toHaveBeenCalledTimes(5);
  });

  it('skips a rotated page', async () => {
    const doc = fakeDoc([fakePage(90), fakePage(0)]);
    await readInkBounds(doc, () => true);
    expect(renderedPage()).toHaveBeenCalledTimes(1);
    expect(renderedPage().mock.calls[0][0]).toBe(await doc.getPage(2));
  });

  it('returns null as soon as the caller is no longer live', async () => {
    const live = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const doc = fakeDoc([fakePage(), fakePage(), fakePage()]);
    expect(await readInkBounds(doc, live)).toBeNull();
    expect(renderedPage()).toHaveBeenCalledTimes(1);
    expect(doc.getPage).toHaveBeenCalledTimes(2);
  });

  it('renders at 800 pixels wide whatever the page width', async () => {
    await readInkBounds(fakeDoc([fakePage(0, 400)]), () => true);
    expect(renderedPage().mock.calls[0][1]).toEqual({ scale: 2, rotation: 0 });
  });

  it('reads an upside-down page, whose rows still run across', async () => {
    const result = await readInkBounds(fakeDoc([fakePage(180)]), () => true);
    expect(result).toEqual({ left: 0.125, right: 0.875 });
    expect(renderedPage().mock.calls[0][1]).toMatchObject({ rotation: 180 });
  });

  it('gives a page the person turned upside down in the unturned page\'s frame, as turnedPageBox expects', async () => {
    pageRows = rowsOf(5, 400, 720);
    const result = await readInkBounds(fakeDoc([fakePage()]), () => true, { 0: 2 });
    expect(result?.left).toBeCloseTo(0.1);
    expect(result?.right).toBeCloseTo(0.5);
  });

  it('leaves a file\'s own upside-down page as shown, since no person turned it', async () => {
    pageRows = rowsOf(5, 400, 720);
    const result = await readInkBounds(fakeDoc([fakePage(180)]), () => true);
    expect(result?.left).toBeCloseTo(0.5);
    expect(result?.right).toBeCloseTo(0.9);
  });

  it('skips a page the person turned sideways, and reads one they turned back upright', async () => {
    const doc = fakeDoc([fakePage(0), fakePage(90)]);
    await readInkBounds(doc, () => true, { 0: 1, 1: 3 });
    expect(renderedPage()).toHaveBeenCalledTimes(1);
    expect(renderedPage().mock.calls[0][0]).toBe(await doc.getPage(2));
    expect(renderedPage().mock.calls[0][1]).toMatchObject({ rotation: 0 });
  });

  it('releases each canvas once it has been read', async () => {
    const canvases: Array<ReturnType<typeof fakeCanvas>> = [];
    renderedPage().mockImplementation(async () => {
      const c = fakeCanvas();
      canvases.push(c);
      return c as never;
    });
    await readInkBounds(fakeDoc([fakePage(), fakePage()]), () => true);
    expect(canvases).toHaveLength(2);
    expect(canvases.every((c) => c.width === 0)).toBe(true);
  });
});

describe('readPageInk', () => {
  beforeEach(() => {
    renderedPage().mockReset().mockImplementation(async () => fakeCanvas() as never);
  });

  it('reads one page by index and covers every row, the longest included', async () => {
    pageRows = [...ROWS, { left: 80, right: 790 }];
    const doc = fakeDoc([fakePage(), fakePage()]);
    expect(await readPageInk(doc, 1, () => true)).toEqual({ left: 0.1, right: 790 / 800 });
    expect(doc.getPage).toHaveBeenCalledWith(2);
  });

  it('is null for a sideways page', async () => {
    expect(await readPageInk(fakeDoc([fakePage(90)]), 0, () => true)).toBeNull();
  });
});
