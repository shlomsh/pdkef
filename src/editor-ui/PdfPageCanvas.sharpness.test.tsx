import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pointAtLegacyWorker } from '../test/support/realPdfjs.ts';
import PdfPageCanvas from './PdfPageCanvas.tsx';

pointAtLegacyWorker(pdfjs);
const UNIT = { width: 595, height: 842 };

// The cases that need a real layout (a shown width, a resize) run in PdfPageCanvas.sharpness.browser.test.tsx.
describe('PdfPageCanvas renders at the size the page is shown', () => {
  let host: HTMLElement | null = null;
  let doc: PDFDocumentProxy;

  beforeEach(async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([UNIT.width, UNIT.height]);
    doc = await pdfjs.getDocument({ data: new Uint8Array(await pdf.save()) }).promise;
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(async () => {
    act(() => render(null, host!));
    host!.remove();
    await doc.loadingTask.destroy();
  });

  // Resolves with the next real paint of the page.
  const nextPaint = () => new Promise<void>((resolve) => host!.addEventListener('page-painted', () => resolve(), { once: true }));

  it('keeps the old fixed scale when the width cannot be measured', async () => {
    // jsdom has no layout, so the canvas reports no shown width, as an unmeasurable one does.
    const painted = nextPaint();
    act(() => render(<PdfPageCanvas pdfDocument={doc} pageNum={1} />, host!));
    await act(() => painted);
    expect(host!.querySelector<HTMLCanvasElement>('canvas')!.width).toBe(Math.floor(UNIT.width * 1.5));
  });
});
