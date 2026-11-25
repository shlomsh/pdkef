// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument, degrees, rgb } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pointAtLegacyWorker } from '../../../test/support/realPdfjs.ts';

// Spy-through: the real renderer paints real PDFs into jsdom's canvas; the spy shows what it was asked for.
// The row finder (textRows.ts) and inkBounds.ts stay real and read those pixels.
vi.mock('#lib/pdf/renderPage.js', { spy: true });

import { renderPageToCanvas } from '#lib/pdf/renderPage.js';
import { readInkBounds, readPageInk } from './readInkBounds.ts';

pointAtLegacyWorker(pdfjs);

type Row = { left: number; right: number };
// Five rows from 50pt to 350pt on a 400pt page; rendered at 800px they read back as left 0.125, right 0.875.
const ROWS: Row[] = Array.from({ length: 5 }, () => ({ left: 50, right: 350 }));
const rowsOf = (n: number, left: number, right: number): Row[] => Array.from({ length: n }, () => ({ left, right }));

interface PageSpec { rotate?: number; rows?: Row[]; width?: number }

// A 400 x 500pt page (800 x 1000 px at the sample scale) with one solid 10pt-tall ink bar per row, from 50pt down in 50pt steps.
async function pdfOf(pages: PageSpec[]) {
  const doc = await PDFDocument.create();
  for (const { rotate = 0, rows = ROWS, width = 400 } of pages) {
    const page = doc.addPage([width, 500]);
    rows.forEach((row, i) => page.drawRectangle({ x: row.left, y: 500 - (50 + i * 50) - 10, width: row.right - row.left, height: 10, color: rgb(0, 0, 0) }));
    page.setRotation(degrees(rotate));
  }
  return doc.save();
}

const opened: Array<ReturnType<typeof pdfjs.getDocument>> = [];
async function openDoc(pages: PageSpec[]) {
  const task = pdfjs.getDocument({ data: await pdfOf(pages) });
  opened.push(task);
  return await task.promise as unknown as PDFDocumentProxy;
}
const renderedPage = () => vi.mocked(renderPageToCanvas);

afterEach(async () => {
  renderedPage().mockClear();
  await Promise.all(opened.splice(0).map((t) => t.destroy()));
});

describe('readInkBounds', () => {
  it('reads the text span as fractions of the page width', async () => {
    const result = await readInkBounds(await openDoc([{}]), () => true);
    expect(result).toEqual({ left: 0.125, right: 0.875 });
  });

  it('samples at most the first five pages', async () => {
    const doc = await openDoc(Array.from({ length: 9 }, () => ({})));
    const getPage = vi.spyOn(doc, 'getPage');
    await readInkBounds(doc, () => true);
    expect(getPage).toHaveBeenCalledTimes(5);
    expect(renderedPage()).toHaveBeenCalledTimes(5);
  });

  it('skips a rotated page', async () => {
    const doc = await openDoc([{ rotate: 90 }, { rotate: 0 }]);
    await readInkBounds(doc, () => true);
    expect(renderedPage()).toHaveBeenCalledTimes(1);
    expect(renderedPage().mock.calls[0][0]).toBe(await doc.getPage(2));
  });

  it('returns null as soon as the caller is no longer live', async () => {
    let checks = 0;
    const live = () => checks++ === 0;
    const doc = await openDoc([{}, {}, {}]);
    const getPage = vi.spyOn(doc, 'getPage');
    expect(await readInkBounds(doc, live)).toBeNull();
    expect(renderedPage()).toHaveBeenCalledTimes(1);
    expect(getPage).toHaveBeenCalledTimes(2);
  });

  it('renders at 800 pixels wide whatever the page width', async () => {
    await readInkBounds(await openDoc([{ width: 400 }]), () => true);
    expect(renderedPage().mock.calls[0][1]).toEqual({ scale: 2, rotation: 0 });
  });

  it('reads an upside-down page, whose rows still run across', async () => {
    const result = await readInkBounds(await openDoc([{ rotate: 180 }]), () => true);
    expect(result).toEqual({ left: 0.125, right: 0.875 });
    expect(renderedPage().mock.calls[0][1]).toMatchObject({ rotation: 180 });
  });

  it('gives a page the person turned upside down in the unturned page\'s frame, as turnedPageBox expects', async () => {
    // Ink at 0.1 to 0.5 of the unturned page shows at 0.5 to 0.9 once turned; the read hands back the unturned frame.
    const result = await readInkBounds(await openDoc([{ rows: rowsOf(5, 40, 200) }]), () => true, { 0: 2 });
    expect(result?.left).toBeCloseTo(0.1);
    expect(result?.right).toBeCloseTo(0.5);
  });

  it('leaves a file\'s own upside-down page as shown, since no person turned it', async () => {
    // The page's own /Rotate 180 shows ink drawn at 0.1 to 0.5 as 0.5 to 0.9.
    const result = await readInkBounds(await openDoc([{ rotate: 180, rows: rowsOf(5, 40, 200) }]), () => true);
    expect(result?.left).toBeCloseTo(0.5);
    expect(result?.right).toBeCloseTo(0.9);
  });

  it('skips a page the person turned sideways, and reads one they turned back upright', async () => {
    const doc = await openDoc([{ rotate: 0 }, { rotate: 90 }]);
    await readInkBounds(doc, () => true, { 0: 1, 1: 3 });
    expect(renderedPage()).toHaveBeenCalledTimes(1);
    expect(renderedPage().mock.calls[0][0]).toBe(await doc.getPage(2));
    expect(renderedPage().mock.calls[0][1]).toMatchObject({ rotation: 0 });
  });

  it('releases each canvas once it has been read', async () => {
    await readInkBounds(await openDoc([{}, {}]), () => true);
    const canvases = await Promise.all(renderedPage().mock.results.map((r) => r.value as Promise<HTMLCanvasElement>));
    expect(canvases).toHaveLength(2);
    expect(canvases.every((c) => c.width === 0)).toBe(true);
  });
});

describe('readPageInk', () => {
  it('reads one page by index and covers every row, the longest included', async () => {
    const doc = await openDoc([{}, { rows: [...ROWS, { left: 40, right: 395 }] }]);
    const getPage = vi.spyOn(doc, 'getPage');
    expect(await readPageInk(doc, 1, () => true)).toEqual({ left: 0.1, right: 790 / 800 });
    expect(getPage).toHaveBeenCalledWith(2);
  });

  it('is null for a sideways page', async () => {
    expect(await readPageInk(await openDoc([{ rotate: 90 }]), 0, () => true)).toBeNull();
  });
});
