import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { splitPdf } from './split.js';

function fixture(name) {
  const buffer = fs.readFileSync(path.resolve(__dirname, '../../lib/__fixtures__/encrypted', name));
  return new File([buffer], name, { type: 'application/pdf' });
}

describe('splitPdf on a protected file', () => {
  // An owner-only file opens without a password, but its page streams are still
  // encrypted: copying them out would write blank pages, so it refuses instead.
  it.each(['combined', 'separate'])('refuses an owner-only file in %s mode', async (mode) => {
    await expect(splitPdf(fixture('owner-only.pdf'), { pageNumbers: [1], mode })).rejects.toThrow(
      /protected/i,
    );
  });
});

describe('splitPdf library integration with real fixtures', () => {
  function getFixtureFile(name) {
    const filePath = path.resolve(__dirname, '../../lib/__fixtures__', name);
    const buffer = fs.readFileSync(filePath);
    return new File([buffer], name, { type: 'application/pdf' });
  }

  async function extractTextFromPdfBlob(blob) {
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
      const pageText = textContent.items.map(item => item.str).join('').trim();
      pageTexts.push(pageText);
    }
    await loadingTask.destroy();
    return pageTexts;
  }

  it('splits page range 2-4 from num-5.pdf to yield pages "12", "13", "14"', async () => {
    const file = getFixtureFile('num-5.pdf');
    const results = await splitPdf(file, { pageNumbers: [2, 3, 4], mode: 'combined' });

    expect(results.length).toBe(1);
    expect(results[0].filename).toBe('extracted_num-5.pdf');
    
    const texts = await extractTextFromPdfBlob(results[0].blob);
    expect(texts).toEqual(['12', '13', '14']);
  });

  it('extracts single page 1 from num-5.pdf to yield page "11"', async () => {
    const file = getFixtureFile('num-5.pdf');
    const results = await splitPdf(file, { pageNumbers: [1], mode: 'combined' });

    expect(results.length).toBe(1);
    expect(results[0].filename).toBe('extracted_num-5.pdf');

    const texts = await extractTextFromPdfBlob(results[0].blob);
    expect(texts).toEqual(['11']);
  });

  it('extracts pages separately', async () => {
    const file = getFixtureFile('num-5.pdf');
    const results = await splitPdf(file, { pageNumbers: [2, 4], mode: 'separate' });

    expect(results.length).toBe(2);
    expect(results[0].filename).toBe('num-5-page-2.pdf');
    expect(results[1].filename).toBe('num-5-page-4.pdf');

    const texts1 = await extractTextFromPdfBlob(results[0].blob);
    expect(texts1).toEqual(['12']);

    const texts2 = await extractTextFromPdfBlob(results[1].blob);
    expect(texts2).toEqual(['14']);
  });

  it('applies the per-page rotation map in both modes (pageOps.js, shared with Merge and Edit Pages)', async () => {
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const file = getFixtureFile('num-5.pdf');

    const combined = await splitPdf(file, {
      pageNumbers: [1, 2, 3],
      mode: 'combined',
      rotations: { 2: 90 },
    });
    const combinedDoc = await PDFDocument.load(new Uint8Array(await combined[0].blob.arrayBuffer()));
    expect(combinedDoc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 0]);

    const separate = await splitPdf(file, {
      pageNumbers: [2],
      mode: 'separate',
      rotations: { 2: 270 },
    });
    const separateDoc = await PDFDocument.load(new Uint8Array(await separate[0].blob.arrayBuffer()));
    expect(separateDoc.getPages()[0].getRotation().angle).toBe(270);
  });
});
