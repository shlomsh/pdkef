import { describe, expect, it, beforeAll } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, PDFString, StandardFonts } from '@cantoo/pdf-lib';
import { readSavedFile } from './readSavedFile.ts';
import { PDFJS_WASM_URL } from '../../../lib/pdfjsWasm.js';

// A real, valid 1x1 opaque PNG (69 bytes).
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

beforeAll(() => {
  const workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  const workerUrl = pathToFileURL(workerPath).href;

  Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', {
    get() { return workerUrl; },
    set() { /* ignore - keep it pointed at the real worker file */ },
    configurable: true,
  });
});

async function buildFixture() {
  const doc = await PDFDocument.create();
  doc.setTitle('Secret Title 12345');
  doc.setAuthor('Jane Doe');
  doc.setSubject('Secret Subject');
  doc.setKeywords(['secretkeyword']);

  const font = await doc.embedFont(StandardFonts.Helvetica);

  const textPage = doc.addPage([400, 200]);
  textPage.drawText('Hello visible text 555-1234', { x: 20, y: 160, size: 12, font });

  const form = doc.getForm();
  const field = form.createTextField('secret.field');
  field.setText('field-secret-value');
  field.addToPage(textPage, { x: 20, y: 100, width: 150, height: 20, font });

  // A Link annotation with a URI action, the way readPlacesForPage reads it back.
  const context = doc.context;
  const linkAnnot = context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [20, 60, 170, 80],
    Border: [0, 0, 0],
    A: {
      Type: 'Action',
      S: 'URI',
      URI: PDFString.of('https://example.com/secret-path'),
    },
  });
  const linkRef = context.register(linkAnnot);
  textPage.node.addAnnot(linkRef);

  const imagePage = doc.addPage([400, 200]);
  const png = await doc.embedPng(
    Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0)),
  );
  imagePage.drawImage(png, { x: 0, y: 0, width: 400, height: 200 });

  await doc.attach(
    Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0)),
    'secret-attachment.png',
    { mimeType: 'image/png' },
  );

  const bytes = await doc.save();
  return new Uint8Array(bytes);
}

function loadPdfjsDoc(bytes) {
  return pdfjs.getDocument({ data: bytes.slice(), wasmUrl: PDFJS_WASM_URL });
}

describe('readSavedFile', () => {
  it('reads page text, places and detects an image-only page', async () => {
    const bytes = await buildFixture();
    const loadingTask = loadPdfjsDoc(bytes);
    const pdfDoc = await loadingTask.promise;
    try {
      const result = await readSavedFile(pdfjs, pdfDoc, { picturePages: [] });

      expect(result.pages).toHaveLength(2);
      expect(result.pages[0].text.text).toContain('Hello visible text');

      const kinds = result.places.map((place) => place.kind).sort();
      expect(kinds).toEqual(
        expect.arrayContaining(['attachment', 'author', 'field', 'keywords', 'link', 'subject', 'title']),
      );

      const field = result.places.find((place) => place.kind === 'field');
      expect(field).toMatchObject({ kind: 'field', text: 'field-secret-value', pageIndex: 0 });

      // The field's name is reported too, marked as not removable.
      const fieldName = result.places.find((place) => place.kind === 'field' && place.removable === false);
      expect(fieldName).toMatchObject({ text: 'secret.field', pageIndex: 0, removable: false });

      const link = result.places.find((place) => place.kind === 'link');
      expect(link).toMatchObject({ kind: 'link', text: 'https://example.com/secret-path', pageIndex: 0 });

      const title = result.places.find((place) => place.kind === 'title');
      expect(title?.text).toBe('Secret Title 12345');

      const attachment = result.places.find((place) => place.kind === 'attachment');
      expect(attachment?.text).toBe('secret-attachment.png');
      expect(result.attachmentCount).toBe(1);

      // The second page has no text items and one image paint op.
      expect(result.picturePages).toEqual([1]);
    } finally {
      await loadingTask.destroy();
    }
  });

  it('unions options.picturePages with detected picture pages, sorted and unique', async () => {
    const bytes = await buildFixture();
    const loadingTask = loadPdfjsDoc(bytes);
    const pdfDoc = await loadingTask.promise;
    try {
      const result = await readSavedFile(pdfjs, pdfDoc, { picturePages: [0, 1] });
      expect(result.picturePages).toEqual([0, 1]);
    } finally {
      await loadingTask.destroy();
    }
  });
});
