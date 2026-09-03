import { expect, test } from '@playwright/test';
import { LANGUAGE_ACCEPTANCE_MATRIX } from '../../scripts/language-acceptance.mjs';
import { FONT_MANIFEST } from '../../scripts/font-manifest.mjs';
import {
  buildSignBundle,
  findPdfWorkerUrl,
  removeSignBundle,
} from './fixtures/exportRenderHarness.js';
import { useTemporaryBundle } from './fixtures/temporaryBundle.js';

const BUNDLE_FILENAME = '__e2e-language-acceptance-bundle.js';
const fontByFamily = new Map(FONT_MANIFEST.map((font) => [font.family, font]));
const faceDescriptor = {
  normal: { fontWeight: 'normal', fontStyle: 'normal' },
  bold: { fontWeight: 'bold', fontStyle: 'normal' },
  italic: { fontWeight: 'normal', fontStyle: 'italic' },
  boldItalic: { fontWeight: 'bold', fontStyle: 'italic' },
};

const cases = LANGUAGE_ACCEPTANCE_MATRIX
  .filter((row) => row.status === 'shipped')
  .flatMap((row) => row.families.flatMap((family) => {
    const font = fontByFamily.get(family);
    return Object.entries(font.faces).map(([face, file]) => ({
      id: `${row.id}/${family}/${face}`,
      sample: row.sample,
      direction: row.direction,
      family,
      file,
      ...faceDescriptor[face],
    }));
  }));

const exportRenderBundle = useTemporaryBundle(test, {
  filename: BUNDLE_FILENAME,
  build: buildSignBundle,
  remove: removeSignBundle,
});

test.describe('language/font acceptance in Chrome', () => {
  test.setTimeout(240_000);

  test(`renders visible, extractable PDF text through all ${cases.length} accepted language/face combinations`, async ({ page }) => {
    await exportRenderBundle.open(page);
    const workerSrc = findPdfWorkerUrl();

    const results = await page.evaluate(async ({ testCases, pdfWorkerSrc }) => {
      const { signPdf, PDFDocument, pdfjs } = window.__exportRender;
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
      const source = await PDFDocument.create();
      for (let index = 0; index < testCases.length; index += 1) source.addPage([360, 120]);
      const sourceBytes = await source.save();
      const elements = testCases.map((testCase, pageIndex) => ({
        id: `acceptance-${pageIndex}`,
        type: 'text',
        pageIndex,
        left: testCase.direction === 'rtl' ? 92 : 8,
        top: 38,
        text: testCase.sample,
        textDirection: testCase.direction,
        fontFamily: testCase.family,
        fontWeight: testCase.fontWeight,
        fontStyle: testCase.fontStyle,
        fontSize: 20,
        color: '#000000',
      }));
      const blob = await signPdf(new File([sourceBytes], 'language-acceptance.pdf', { type: 'application/pdf' }), elements);
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(await blob.arrayBuffer()),
        useWorkerFetch: false,
        isEvalSupported: false,
      });
      const output = await loadingTask.promise;
      const measured = [];
      for (let pageNumber = 1; pageNumber <= output.numPages; pageNumber += 1) {
        const pdfPage = await output.getPage(pageNumber);
        const textContent = await pdfPage.getTextContent();
        const viewport = pdfPage.getViewport({ scale: 0.75 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        await pdfPage.render({ canvasContext: context, viewport }).promise;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let inkPixels = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (pixels[offset + 3] > 0 && (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245)) inkPixels += 1;
        }
        measured.push({
          id: testCases[pageNumber - 1].id,
          extracted: textContent.items.map((item) => item.str).join(''),
          inkPixels,
        });
        pdfPage.cleanup();
      }
      await loadingTask.destroy();
      return measured;
    }, { testCases: cases, pdfWorkerSrc: workerSrc });

    const blank = results.filter((result) => result.inkPixels < 20);
    const unsearchable = results.filter((result) => !result.extracted || result.extracted.includes('\uFFFD'));
    expect(blank, `These accepted faces produced no meaningful ink: ${blank.map((entry) => entry.id).join(', ')}`).toEqual([]);
    expect(unsearchable, `These accepted faces produced no searchable text: ${unsearchable.map((entry) => entry.id).join(', ')}`).toEqual([]);
  });
});
