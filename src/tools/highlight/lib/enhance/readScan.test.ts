// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { leaning } from '#lib/pageEnhance/leaning.test-helper.ts';
import { pointAtLegacyWorker } from '../../../../test/support/realPdfjs.ts';

import { renderPageToCanvas } from '#lib/pdf/renderPage.js';
import { assess } from '#lib/pageEnhance/plan.ts';
import { readScan } from './readScan.ts';

// Spy-through: real PDFs of scanned sheets are read and rendered for real; the spy shows what the renderer was asked for.
vi.mock('#lib/pdf/renderPage.js', { spy: true });
pointAtLegacyWorker(pdfjs);

// The sheet is 800 x 120 pt, so the reader's 1000 px scale paints it at 1.25 and one image pixel lands on one canvas pixel.
const SHEET = { width: 800, height: 120 };
const W = 1000;
const H = 150;

/** Two pages leaning apart with a spine between them, as RGBA the way a canvas gives it. */
function spreadPixels(): Uint8ClampedArray {
  const left = leaning(W, H, -3.5, 0, 450);
  const right = leaning(W, H, 2.5, 550, W);
  const data = left.data.map((v, i) => Math.min(v, right.data[i]));
  for (let y = 0; y < H; y += 1) for (let x = 499; x < 502; x += 1) data.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 3);
  return new Uint8ClampedArray(data);
}

/** The pixels as the PNG bytes a scanner's file would hold, made by a real canvas. */
function pngOf(pixels: Uint8ClampedArray): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const image = canvas.getContext('2d')!.createImageData(W, H);
  image.data.set(pixels);
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  return Uint8Array.from(Buffer.from(canvas.toDataURL('image/png').split(',')[1], 'base64'));
}

let spreadPng: Uint8Array | undefined;

interface PageOptions { cover?: number; rotate?: number }

/** A file of pages whose one image covers `cover` of each (1 by default), the pixels of a scan. */
async function scanFile(pages: PageOptions[], pixels?: Uint8ClampedArray) {
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(pixels ? pngOf(pixels) : (spreadPng ??= pngOf(spreadPixels())));
  for (const { cover = 1, rotate = 0 } of pages) {
    const page = doc.addPage([SHEET.width, SHEET.height]);
    page.drawImage(image, { x: 0, y: SHEET.height * (1 - cover), width: SHEET.width, height: SHEET.height * cover });
    page.setRotation(degrees(rotate));
  }
  return doc.save();
}

const opened: Array<ReturnType<typeof pdfjs.getDocument>> = [];
async function openDoc(pages: PageOptions[], pixels?: Uint8ClampedArray) {
  const task = pdfjs.getDocument({ data: await scanFile(pages, pixels) });
  opened.push(task);
  return await task.promise as unknown as PDFDocumentProxy;
}
const rendered = () => vi.mocked(renderPageToCanvas);

describe('readScan', () => {
  afterEach(async () => {
    rendered().mockClear();
    vi.unstubAllGlobals();
    await Promise.all(opened.splice(0).map((t) => t.destroy()));
  });

  it('reads a book scanned two pages to a sheet as a spread', async () => {
    expect(await readScan(await openDoc([{}, {}, {}]), () => true)).toBe('spread');
  });

  it('renders nothing for a file whose pages are not pictures of a sheet', async () => {
    const doc = await openDoc([{ cover: 0.4 }, { cover: 0.4 }, { cover: 0.4 }]);
    expect(await readScan(doc, () => true)).toBe('straight');
    expect(rendered()).not.toHaveBeenCalled();
  });

  it('skips a page that is not an image page and judges the others', async () => {
    const doc = await openDoc([{}, { cover: 0.4 }, {}]);
    expect(await readScan(doc, () => true)).toBe('spread');
    expect(rendered()).toHaveBeenCalledTimes(2);
  });

  it('renders at the page\'s own rotation at about 1000 px, whatever the person turned', async () => {
    await readScan(await openDoc([{ rotate: 90 }]), () => true);
    expect(rendered().mock.calls[0][1]).toEqual({ scale: 1000 / SHEET.width, rotation: 90, signal: undefined });
  });

  it('releases each canvas once its pixels are read', async () => {
    await readScan(await openDoc([{}, {}]), () => true);
    const canvases = await Promise.all(rendered().mock.results.map((r) => r.value as Promise<HTMLCanvasElement>));
    expect(canvases).toHaveLength(2);
    expect(canvases.every((c) => c.width === 0)).toBe(true);
  });

  it('stops and returns null once the caller is no longer live', async () => {
    let asked = 0;
    const live = () => ++asked <= 2;
    expect(await readScan(await openDoc([{}, {}, {}]), live)).toBeNull();
    expect(rendered().mock.calls.length).toBeLessThan(3);
  });

  it('stops once the signal aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await readScan(await openDoc([{}]), () => true, controller.signal)).toBeNull();
  });

  it('gives the same verdict from a worker as from the main thread, and ends the worker', async () => {
    // Forced: the mock worker's terminate recorder, with the Worker below.
    const terminate = vi.fn();
    class FakeWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      terminate = terminate;
      postMessage({ id, gray: sent }: { id: number; gray: Parameters<typeof assess>[0] }) {
        queueMicrotask(() => this.onmessage?.({ data: { id, ok: true, value: assess(sent) } }));
      }
    }
    const doc = () => openDoc([{}, {}]);
    const main = await readScan(await doc(), () => true);
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: jsdom has no Worker, so the worker path needs a mock class in its place.
    vi.stubGlobal('Worker', FakeWorker);
    const viaWorker = await readScan(await doc(), () => true);
    expect(viaWorker).toBe(main);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('falls back to the main thread when the module worker cannot start', async () => {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: a module worker that cannot start cannot be made in jsdom (it has no Worker at all).
    vi.stubGlobal('Worker', class { constructor() { throw new Error('no module workers'); } });
    expect(await readScan(await openDoc([{}, {}]), () => true)).toBe('spread');
  });

  it('reads a level page as straight', async () => {
    const level = new Uint8ClampedArray(leaning(W, H, 0).data);
    expect(await readScan(await openDoc([{}, {}], level), () => true)).toBe('straight');
  });
});

