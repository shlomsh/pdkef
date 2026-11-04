import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { leaning } from '#lib/pageEnhance/leaning.test-helper.ts';

const renderPageToCanvas = vi.fn();
vi.mock('#lib/pdf/renderPage.js', () => ({ renderPageToCanvas: (...a: unknown[]) => renderPageToCanvas(...a) }));
const OPS = { save: 10, restore: 11, transform: 12, paintImageXObject: 85, paintInlineImageXObject: 86, paintImageMaskXObject: 83, showText: 44 };
vi.mock('#lib/pdf/loadPdfjs.js', () => ({ getPdfjs: async () => ({ OPS }) }));

import { assess } from '#lib/pageEnhance/plan.ts';
import { readScan } from './readScan.ts';

const W = 800;
const H = 500;
const PAGE = { width: 600, height: 800 };

/** Two pages leaning apart with a spine between them, as RGBA the way a canvas gives it. */
function spreadPixels(): Uint8ClampedArray {
  const left = leaning(W, H, -3.5, 0, 400);
  const right = leaning(W, H, 2.5, 400, W);
  const data = left.data.map((v, i) => Math.min(v, right.data[i]));
  for (let y = 0; y < H; y += 1) for (let x = 399; x < 402; x += 1) data.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
  return new Uint8ClampedArray(data);
}

interface PageOptions { cover?: number; rotate?: number }

/** A page whose one image covers `cover` of it (1 by default), with the text of a searchable scan on top. */
function fakePage({ cover = 1, rotate = 0 }: PageOptions = {}) {
  return {
    rotate,
    getViewport: vi.fn(({ rotation = rotate }: { scale: number; rotation?: number }) => {
      const sideways = rotation % 180 !== 0;
      return { width: sideways ? PAGE.height : PAGE.width, height: sideways ? PAGE.width : PAGE.height, viewBox: [0, 0, PAGE.width, PAGE.height] };
    }),
    getOperatorList: vi.fn(async () => ({
      fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore, OPS.showText],
      argsArray: [[], [PAGE.width, 0, 0, PAGE.height * cover, 0, 0], ['img', 1, 1], [], []],
    })),
  };
}

function fakeDoc(pages: Array<ReturnType<typeof fakePage>>) {
  return { numPages: pages.length, getPage: vi.fn(async (n: number) => pages[n - 1]) } as unknown as PDFDocumentProxy & { getPage: ReturnType<typeof vi.fn> };
}

function fakeCanvas(pixels: Uint8ClampedArray | null = spreadPixels()) {
  const canvas = {
    width: W, height: H,
    getContext: () => ({ getImageData: () => ({ data: pixels ?? new Uint8ClampedArray(W * H * 4).fill(255), width: W, height: H }) }),
  };
  return canvas;
}

describe('readScan', () => {
  let canvases: Array<ReturnType<typeof fakeCanvas>>;
  beforeEach(() => {
    canvases = [];
    renderPageToCanvas.mockReset().mockImplementation(async () => { const c = fakeCanvas(); canvases.push(c); return c; });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads a book scanned two pages to a sheet as a spread', async () => {
    expect(await readScan(fakeDoc([fakePage(), fakePage(), fakePage()]), () => true)).toBe('spread');
  });

  it('renders nothing for a file whose pages are not pictures of a sheet', async () => {
    const doc = fakeDoc([fakePage({ cover: 0.4 }), fakePage({ cover: 0.4 }), fakePage({ cover: 0.4 })]);
    expect(await readScan(doc, () => true)).toBe('straight');
    expect(renderPageToCanvas).not.toHaveBeenCalled();
  });

  it('skips a page that is not an image page and judges the others', async () => {
    const doc = fakeDoc([fakePage(), fakePage({ cover: 0.4 }), fakePage()]);
    expect(await readScan(doc, () => true)).toBe('spread');
    expect(renderPageToCanvas).toHaveBeenCalledTimes(2);
  });

  it('renders at the page\'s own rotation at about 1000 px, whatever the person turned', async () => {
    await readScan(fakeDoc([fakePage({ rotate: 90 })]), () => true);
    expect(renderPageToCanvas.mock.calls[0][1]).toEqual({ scale: 1000 / PAGE.height, rotation: 90 });
  });

  it('releases each canvas once its pixels are read', async () => {
    await readScan(fakeDoc([fakePage(), fakePage()]), () => true);
    expect(canvases).toHaveLength(2);
    expect(canvases.every((c) => c.width === 0)).toBe(true);
  });

  it('stops and returns null once the caller is no longer live', async () => {
    const live = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
    expect(await readScan(fakeDoc([fakePage(), fakePage(), fakePage()]), live)).toBeNull();
    expect(renderPageToCanvas.mock.calls.length).toBeLessThan(3);
  });

  it('stops once the signal aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await readScan(fakeDoc([fakePage()]), () => true, controller.signal)).toBeNull();
  });

  it('gives the same verdict from a worker as from the main thread, and ends the worker', async () => {
    const terminate = vi.fn();
    class FakeWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      terminate = terminate;
      postMessage({ id, gray: sent }: { id: number; gray: Parameters<typeof assess>[0] }) {
        queueMicrotask(() => this.onmessage?.({ data: { id, ok: true, value: assess(sent) } }));
      }
    }
    const doc = () => fakeDoc([fakePage(), fakePage()]);
    const main = await readScan(doc(), () => true);
    vi.stubGlobal('Worker', FakeWorker);
    const viaWorker = await readScan(doc(), () => true);
    expect(viaWorker).toBe(main);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('falls back to the main thread when the module worker cannot start', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('no module workers'); } });
    expect(await readScan(fakeDoc([fakePage(), fakePage()]), () => true)).toBe('spread');
  });

  it('reads a level page as straight', async () => {
    renderPageToCanvas.mockImplementation(async () => fakeCanvas(new Uint8ClampedArray(leaning(W, H, 0).data)));
    expect(await readScan(fakeDoc([fakePage(), fakePage()]), () => true)).toBe('straight');
  });
});

