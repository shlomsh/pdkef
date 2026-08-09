import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { mergePdfs, resolvePdfCreationDate } from './merge.js';

// PdfMergeTool.test.jsx mocks merge.js outright, so nothing in the component
// suite ever runs this file's real pdf-lib calls - see the same gap noted for
// redact.test.js. These fixtures are single-page PDFs whose one page reads its
// own file number ("num-3.pdf" -> "3"), which makes both order and content
// checkable from the merged output without a canvas/pdf.js round trip.
describe('mergePdfs library integration with real fixtures', () => {
  function getFixtureFile(name) {
    const filePath = path.resolve(__dirname, './__fixtures__', name);
    const buffer = fs.readFileSync(filePath);
    return new File([buffer], name, { type: 'application/pdf' });
  }

  async function getPdfPageTexts(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const pageTexts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      pageTexts.push(textContent.items.map((item) => item.str).join('').trim());
    }
    await loadingTask.destroy();
    return { pageCount: pdf.numPages, pageTexts };
  }

  it('merges files in the given order, preserving every page', async () => {
    const files = ['num-1.pdf', 'num-2.pdf', 'num-3.pdf', 'num-4.pdf'].map(getFixtureFile);
    const blob = await mergePdfs(files);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/pdf');
    const { pageCount, pageTexts } = await getPdfPageTexts(blob);
    expect(pageCount).toBe(4);
    expect(pageTexts).toEqual(['1', '2', '3', '4']);
  });

  it('numbers pages with a running index across file boundaries, not reset per file', async () => {
    // If addPageNumbers reset per file instead of tracking a single running
    // index, the first page of num-3.pdf would be stamped "1" again instead
    // of "2" - the same class of bug as Split's per-file vs. global counters.
    const files = [getFixtureFile('num-2.pdf'), getFixtureFile('num-3.pdf')];
    const blob = await mergePdfs(files, { addPageNumbers: true });

    const { pageCount, pageTexts } = await getPdfPageTexts(blob);
    expect(pageCount).toBe(2);
    expect(pageTexts[0]).toContain('2'); // this file's own page text
    expect(pageTexts[0]).toContain('1'); // stamp: 1st page overall
    expect(pageTexts[1]).toContain('3'); // this file's own page text
    expect(pageTexts[1]).toContain('2'); // stamp: 2nd page overall, not "1" again
  });

  it('accepts a bare progress callback in place of the options object', async () => {
    const files = [getFixtureFile('num-1.pdf'), getFixtureFile('num-2.pdf')];
    const progressValues = [];

    // mergePdfs(files, onProgress) - the back-compat call shape without an
    // explicit options argument - shifts the callback into place internally.
    const blob = await mergePdfs(files, (fraction) => progressValues.push(fraction));

    expect(blob).toBeInstanceOf(Blob);
    expect(progressValues).toEqual([0.5, 1]);
  });

  it('reports progress once per file, ending at 1', async () => {
    const files = ['num-1.pdf', 'num-2.pdf', 'num-3.pdf'].map(getFixtureFile);
    const progressValues = [];
    await mergePdfs(files, {}, (fraction) => progressValues.push(fraction));

    expect(progressValues).toEqual([1 / 3, 2 / 3, 1]);
  });

  it('resolvePdfCreationDate reads back a date the file actually has', async () => {
    const knownDate = new Date('2020-01-15T00:00:00.000Z');
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    doc.setCreationDate(knownDate);
    const bytes = await doc.save();
    const file = new File([bytes], 'dated.pdf', { type: 'application/pdf' });

    const resolved = await resolvePdfCreationDate(file);
    expect(resolved).toBe(knownDate.getTime());
  });

  it('resolvePdfCreationDate returns null rather than throwing for a file that is not a PDF at all', async () => {
    const file = new File(['this is not a pdf'], 'garbage.pdf', { type: 'application/pdf' });

    const resolved = await resolvePdfCreationDate(file);
    expect(resolved).toBeNull();
  });
});
