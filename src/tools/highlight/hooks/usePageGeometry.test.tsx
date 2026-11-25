import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pointAtLegacyWorker } from '../../../test/support/realPdfjs.ts';
import { usePageGeometry } from './usePageGeometry.ts';

pointAtLegacyWorker(pdfjs);

let container: HTMLElement | null = null;
let api: ReturnType<typeof usePageGeometry>;
let task: ReturnType<typeof pdfjs.getDocument> | null = null;

function Probe(props: { doc: PDFDocumentProxy; turns: number }) {
  api = usePageGeometry(props.doc, 0, props.turns);
  return null;
}

// A real 600 x 800 pt PDF opened in pdf.js; getPage is spied through so the test can count reads.
async function realDocument() {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 800]);
  task = pdfjs.getDocument({ data: await pdf.save() });
  const doc = await task.promise as unknown as PDFDocumentProxy;
  return { doc, getPage: vi.spyOn(doc, 'getPage') };
}

afterEach(async () => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  await task?.destroy();
  task = null;
});

describe('usePageGeometry', () => {
  it('turns the geometry it already holds at once, without reading the page again', async () => {
    const { doc, getPage } = await realDocument();
    container = document.createElement('div');
    act(() => render(<Probe doc={doc} turns={0} />, container!));
    await vi.waitFor(() => expect(api.geometry).toBeDefined());
    expect(api.geometry?.width).toBe(600);
    expect(api.geometry?.height).toBe(800);

    act(() => render(<Probe doc={doc} turns={1} />, container!));
    expect(api.geometry?.width).toBe(800);
    expect(api.geometry?.height).toBe(600);
    expect(getPage).toHaveBeenCalledTimes(1);
  });
});
