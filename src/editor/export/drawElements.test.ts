import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { PDFDocument, PDFName, PDFNumber, degrees } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { drawElements } from './drawElements.ts';
import { mockFontFetch } from '../adapters/pdf/fontFetch.test-helper.js';
import { embeddedFontFile } from '../text/fonts.js';
import { applyAffineTransform, createPageGeometry, pageGeometryFromPdfJsPage } from '../geometry/coords.ts';
import type { EditorElement } from '../model/editorModel.ts';

// The same loader Sign hands over: bundled faces off /fonts, embedded into the document being drawn.
function loaderFor(pdfDoc: PDFDocument) {
  pdfDoc.registerFontkit(fontkit);
  return async (family: string, weight?: string, style?: string) => {
    const fileName = embeddedFontFile(family, weight, style);
    if (!fileName) return null;
    const res = await fetch(`/fonts/${fileName}`);
    return pdfDoc.embedFont(await res.arrayBuffer(), { subset: true });
  };
}

describe('drawElements', () => {
  let restoreFetch: () => void;

  beforeEach(() => {
    restoreFetch = mockFontFetch();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  it('runs every element serializer through the same cropped transform at 0/90/180/270 degrees', async () => {
    const pdfDoc = await PDFDocument.create();
    const rotations = [0, 90, 180, 270];
    rotations.forEach((rotation) => {
      const page = pdfDoc.addPage([400, 500]);
      page.setCropBox(40, 60, 240, 320);
      page.setRotation(degrees(rotation));
      page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2));
    });
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const elements = rotations.flatMap((_, pageIndex) => [
      { id: `text-${pageIndex}`, type: 'text', pageIndex, left: 10, top: 10, text: 'A', fontFamily: 'Arimo', fontSize: 12, color: '#000000' },
      { id: `symbol-${pageIndex}`, type: 'symbol', pageIndex, left: 20, top: 20, width: 8, height: 8, mark: 'check', color: '#1463ff' },
      { id: `signature-${pageIndex}`, type: 'signature', pageIndex, left: 30, top: 30, width: 12, height: 6, dataUrl: png },
      { id: `line-${pageIndex}`, type: 'line', pageIndex, x1: 10, y1: 50, x2: 40, y2: 60, color: '#1463ff', strokeWidth: 2 },
      { id: `rectangle-${pageIndex}`, type: 'rectangle', pageIndex, left: 45, top: 15, width: 12, height: 10, color: '#1463ff', strokeWidth: 2 },
      { id: `ellipse-${pageIndex}`, type: 'ellipse', pageIndex, left: 60, top: 30, width: 12, height: 10, color: '#1463ff', strokeWidth: 2 },
      { id: `whiteout-${pageIndex}`, type: 'whiteout', pageIndex, left: 70, top: 70, width: 10, height: 8, color: '#ffffff' },
    ]) as EditorElement[];

    await drawElements(pdfDoc, elements, { loadCustomFont: loaderFor(pdfDoc) });
    const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = getDocument({
      data: new Uint8Array(await pdfDoc.save()),
      useWorkerFetch: false,
      isEvalSupported: false,
    } as Parameters<typeof getDocument>[0]);
    const output = await loadingTask.promise;

    for (let pageIndex = 0; pageIndex < rotations.length; pageIndex++) {
      const page = await output.getPage(pageIndex + 1);
      expect(page.view).toEqual([40, 60, 280, 380]);
      expect(page.rotate).toBe(rotations[pageIndex]);
      expect(pageGeometryFromPdfJsPage(page).pdfToViewport)
        .toEqual(page.getViewport({ scale: 1 }).transform);

      const geometry = createPageGeometry({
        cropBox: { x: 40, y: 60, width: 240, height: 320 },
        rotation: rotations[pageIndex],
        userUnit: 2,
      });
      const textContent = await page.getTextContent();
      const textItem = (textContent.items as { str: string; transform: number[] }[]).find((item) => item.str === 'A');
      expect(textItem).toBeDefined();
      const viewportTextOrigin = applyAffineTransform(
        { x: textItem!.transform[4], y: textItem!.transform[5] },
        geometry.pdfToViewport,
      );
      expect(viewportTextOrigin.x).toBeCloseTo(geometry.width * 0.1, 6);
      expect(viewportTextOrigin.y).toBeGreaterThan(geometry.height * 0.1);

      const operatorList = await page.getOperatorList();
      const sharedTransforms = operatorList.fnArray.reduce((count: number, fn: number, index: number) => {
        if (fn !== OPS.transform) return count;
        const args = operatorList.argsArray[index];
        const matches = geometry.editorToPdf.every((value, argIndex) =>
          Math.abs(args[argIndex] - value) < 1e-8);
        return count + (matches ? 1 : 0);
      }, 0);
      // One q/cm/.../Q frame per serializer; a type bypassing the shared transform drops this count.
      expect(sharedTransforms).toBe(7);
    }

    await loadingTask.destroy();
  });

  it('exports a passage comment as a standard annotation only, with its full text in /Contents', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([400, 500]);
    const comment = {
      id: 'c-1', type: 'comment', pageIndex: 0, left: 10, top: 20, width: 50, height: 5, comment: 'great \u{1F44D}',
      anchor: { kind: 'passage', bands: [{ left: 0, top: 0, width: 100, height: 100 }] },
    } as EditorElement;
    await drawElements(pdfDoc, [comment], {});
    const doc = await PDFDocument.load(await pdfDoc.save());
    expect(doc.getPageCount()).toBe(1);
    const annots = doc.getPage(0).node.Annots()!;
    let contents = '';
    for (let i = 0; i < annots.size(); i++) {
      const c = doc.context.lookup(annots.get(i)) as unknown as { get(name: PDFName): { decodeText?: () => string } | undefined };
      const value = c.get(PDFName.of('Contents'));
      if (value?.decodeText?.().includes('great')) contents = value.decodeText!();
    }
    expect(contents).toBe('great \u{1F44D}');
  });

  it('reports progress as a fraction of the drawn elements', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([400, 500]);
    const rectangle = (id: string) => ({ id, type: 'rectangle', pageIndex: 0, left: 10, top: 20, width: 20, height: 10, color: '#1463ff', strokeWidth: 2 }) as EditorElement;
    const onProgress = vi.fn();
    await drawElements(pdfDoc, [rectangle('a'), rectangle('b')], { onProgress });
    expect(onProgress.mock.calls).toEqual([[0.5], [1]]);
  });

  it('refuses a text element when no font loader is given', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([400, 500]);
    const text = { id: 't', type: 'text', pageIndex: 0, left: 10, top: 10, text: 'A', fontFamily: 'Arimo', fontSize: 12, color: '#000000' } as EditorElement;
    await expect(drawElements(pdfDoc, [text], {})).rejects.toThrow('drawElements: a text element needs loadCustomFont');
  });
});
