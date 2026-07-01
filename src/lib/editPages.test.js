import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { editPages } from './editPages.js';

describe('editPages library integration with real fixtures', () => {
  function getFixtureFile(name) {
    const filePath = path.resolve(__dirname, './__fixtures__', name);
    const buffer = fs.readFileSync(filePath);
    return new File([buffer], name, { type: 'application/pdf' });
  }

  async function getPdfDocDetails(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const pageTexts = [];
    const pageRotations = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join('').trim();
      pageTexts.push(pageText);
      pageRotations.push(page.rotate);
    }
    await loadingTask.destroy();
    return { pageCount: pdf.numPages, pageTexts, pageRotations };
  }

  it('removes pages 2 and 4 from num-5.pdf to yield pages "11", "13", "15"', async () => {
    const file = getFixtureFile('num-5.pdf');
    const resultBlob = await editPages(file, {
      removedPageNums: new Set([2, 4])
    });

    expect(resultBlob).toBeInstanceOf(Blob);
    const details = await getPdfDocDetails(resultBlob);
    expect(details.pageCount).toBe(3);
    expect(details.pageTexts).toEqual(['11', '13', '15']);
  });

  it('rotates pages and preserves order', async () => {
    const file = getFixtureFile('num-5.pdf');
    const resultBlob = await editPages(file, {
      rotations: { 1: 90, 3: 180 }
    });

    expect(resultBlob).toBeInstanceOf(Blob);
    const details = await getPdfDocDetails(resultBlob);
    expect(details.pageCount).toBe(5);
    expect(details.pageRotations).toEqual([90, 0, 180, 0, 0]);
  });

  it('adds page numbers to pages', async () => {
    const file = getFixtureFile('num-5.pdf');
    const resultBlob = await editPages(file, {
      addPageNumbers: true
    });

    expect(resultBlob).toBeInstanceOf(Blob);
    const details = await getPdfDocDetails(resultBlob);
    expect(details.pageCount).toBe(5);
    // Page numbers "1", "2", "3", "4", "5" should be drawn, so page texts will include both page number and original number
    // Helvetica baseline strings drawn will appear in the page text items list.
    // Let's verify each page text contains the original digit and the page number stamp.
    expect(details.pageTexts[0]).toContain('11');
    expect(details.pageTexts[0]).toContain('1');
    expect(details.pageTexts[1]).toContain('12');
    expect(details.pageTexts[1]).toContain('2');
    expect(details.pageTexts[4]).toContain('15');
    expect(details.pageTexts[4]).toContain('5');
  });
});
