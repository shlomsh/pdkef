import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const renderPageToCanvas = vi.fn();
const findTextRows = vi.fn();
vi.mock('#lib/pdf/renderPage.js', () => ({ renderPageToCanvas: (...a: unknown[]) => renderPageToCanvas(...a) }));
vi.mock('#lib/pageLayout/textRows.ts', () => ({ findTextRows: (...a: unknown[]) => findTextRows(...a) }));

import { readInkBounds, readPageInk } from './readInkBounds.ts';

// inkBounds.ts stays real: five rows from 100px to 700px on an 800px canvas read back as left 0.125, right 0.875.
const ROWS = Array.from({ length: 5 }, () => ({ left: 100, right: 700 }));

function fakePage(rotate = 0, width = 400) {
  return { rotate, getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: width * scale })) };
}

function fakeDoc(pages: Array<ReturnType<typeof fakePage>>, numPages = pages.length) {
  return { numPages, getPage: vi.fn(async (n: number) => pages[n - 1]) } as unknown as PDFDocumentProxy & { getPage: ReturnType<typeof vi.fn> };
}

function fakeCanvas() {
  return { width: 800, height: 1000, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(4), height: 1000 }) }) };
}

describe('readInkBounds', () => {
  beforeEach(() => {
    renderPageToCanvas.mockReset().mockImplementation(async () => fakeCanvas());
    findTextRows.mockReset().mockReturnValue(ROWS);
  });

  it('reads the text span as fractions of the page width', async () => {
    const result = await readInkBounds(fakeDoc([fakePage()]), () => true);
    expect(result).toEqual({ left: 0.125, right: 0.875 });
  });

  it('samples at most the first five pages', async () => {
    const doc = fakeDoc(Array.from({ length: 9 }, () => fakePage()));
    await readInkBounds(doc, () => true);
    expect(doc.getPage).toHaveBeenCalledTimes(5);
    expect(renderPageToCanvas).toHaveBeenCalledTimes(5);
  });

  it('skips a rotated page', async () => {
    const doc = fakeDoc([fakePage(90), fakePage(0)]);
    await readInkBounds(doc, () => true);
    expect(renderPageToCanvas).toHaveBeenCalledTimes(1);
    expect(renderPageToCanvas.mock.calls[0][0]).toBe(await doc.getPage(2));
  });

  it('returns null as soon as the caller is no longer live', async () => {
    const live = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const doc = fakeDoc([fakePage(), fakePage(), fakePage()]);
    expect(await readInkBounds(doc, live)).toBeNull();
    expect(renderPageToCanvas).toHaveBeenCalledTimes(1);
    expect(doc.getPage).toHaveBeenCalledTimes(2);
  });

  it('renders at 800 pixels wide whatever the page width', async () => {
    await readInkBounds(fakeDoc([fakePage(0, 400)]), () => true);
    expect(renderPageToCanvas.mock.calls[0][1]).toEqual({ scale: 2, rotation: 0 });
  });

  it('reads an upside-down page, whose rows still run across', async () => {
    const result = await readInkBounds(fakeDoc([fakePage(180)]), () => true);
    expect(result).toEqual({ left: 0.125, right: 0.875 });
    expect(renderPageToCanvas.mock.calls[0][1]).toMatchObject({ rotation: 180 });
  });

  it('gives a page the person turned upside down in the unturned page\'s frame, as turnedPageBox expects', async () => {
    findTextRows.mockReturnValue(Array.from({ length: 5 }, () => ({ left: 400, right: 720 })));
    const result = await readInkBounds(fakeDoc([fakePage()]), () => true, { 0: 2 });
    expect(result?.left).toBeCloseTo(0.1);
    expect(result?.right).toBeCloseTo(0.5);
  });

  it('leaves a file\'s own upside-down page as shown, since no person turned it', async () => {
    findTextRows.mockReturnValue(Array.from({ length: 5 }, () => ({ left: 400, right: 720 })));
    const result = await readInkBounds(fakeDoc([fakePage(180)]), () => true);
    expect(result?.left).toBeCloseTo(0.5);
    expect(result?.right).toBeCloseTo(0.9);
  });

  it('skips a page the person turned sideways, and reads one they turned back upright', async () => {
    const doc = fakeDoc([fakePage(0), fakePage(90)]);
    await readInkBounds(doc, () => true, { 0: 1, 1: 3 });
    expect(renderPageToCanvas).toHaveBeenCalledTimes(1);
    expect(renderPageToCanvas.mock.calls[0][0]).toBe(await doc.getPage(2));
    expect(renderPageToCanvas.mock.calls[0][1]).toMatchObject({ rotation: 0 });
  });

  it('releases each canvas once it has been read', async () => {
    const canvases: Array<ReturnType<typeof fakeCanvas>> = [];
    renderPageToCanvas.mockImplementation(async () => {
      const c = fakeCanvas();
      canvases.push(c);
      return c;
    });
    await readInkBounds(fakeDoc([fakePage(), fakePage()]), () => true);
    expect(canvases).toHaveLength(2);
    expect(canvases.every((c) => c.width === 0)).toBe(true);
  });
});

describe('readPageInk', () => {
  beforeEach(() => {
    renderPageToCanvas.mockReset().mockImplementation(async () => fakeCanvas());
  });

  it('reads one page by index and covers every row, the longest included', async () => {
    findTextRows.mockReset().mockReturnValue([...ROWS, { left: 80, right: 790 }]);
    const doc = fakeDoc([fakePage(), fakePage()]);
    expect(await readPageInk(doc, 1, () => true)).toEqual({ left: 0.1, right: 790 / 800 });
    expect(doc.getPage).toHaveBeenCalledWith(2);
  });

  it('is null for a sideways page', async () => {
    expect(await readPageInk(fakeDoc([fakePage(90)]), 0, () => true)).toBeNull();
  });
});
