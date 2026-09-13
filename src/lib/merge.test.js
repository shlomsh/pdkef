import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { MergeFileError, inspectPdf, mergePdfs, mergedFileName, resolvePdfCreationDate } from './merge.js';

// PdfMergeTool.test.tsx mocks merge.js outright, so nothing in the component
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

  // Same as getPdfPageTexts, plus each page's /Rotate as pdf.js sees it -
  // needed for the rotation round-trip test below, which editPages.test.js
  // already treats as the oracle for this exact reading.
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
      pageTexts.push(textContent.items.map((item) => item.str).join('').trim());
      pageRotations.push(page.rotate);
    }
    await loadingTask.destroy();
    return { pageCount: pdf.numPages, pageTexts, pageRotations };
  }

  async function makeEncryptedFile(name = 'encrypted.pdf') {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    // @cantoo/pdf-lib is the pdf-lib fork that added encrypt(); see
    // node_modules/@cantoo/pdf-lib/es/core/security/PDFSecurity.d.ts.
    doc.encrypt({ userPassword: 'secret' });
    const bytes = await doc.save();
    return new File([bytes], name, { type: 'application/pdf' });
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

  describe('MERGE-09 plan support', () => {
    it('reorders across files, skips a page, and rotates a page - texts land in plan order, the skipped page is absent, and the rotation is additive', async () => {
      // num-5.pdf's five pages read '11'..'15'. Plan: file 1 (num-2.pdf, one
      // page reading '2') page 0, then file 0 (num-5.pdf) page 2 ('13',
      // rotated +90), then file 0 page 0 ('11', skipped - must not appear),
      // then file 0 page 1 ('12'). Output should read ['2', '13', '12'].
      const files = [getFixtureFile('num-5.pdf'), getFixtureFile('num-2.pdf')];
      const plan = [
        { fileIndex: 1, pageIndex: 0, rotation: 0, skipped: false },
        { fileIndex: 0, pageIndex: 2, rotation: 90, skipped: false },
        { fileIndex: 0, pageIndex: 0, rotation: 0, skipped: true },
        { fileIndex: 0, pageIndex: 1, rotation: 0, skipped: false },
      ];

      const blob = await mergePdfs(files, { plan });

      const { pageCount, pageTexts, pageRotations } = await getPdfDocDetails(blob);
      expect(pageCount).toBe(3);
      expect(pageTexts).toEqual(['2', '13', '12']);
      expect(pageRotations).toEqual([0, 90, 0]);
    });

    it('counts page numbers over output pages only, excluding skipped entries', async () => {
      const files = [getFixtureFile('num-5.pdf')];
      const plan = [
        { fileIndex: 0, pageIndex: 0, rotation: 0, skipped: false }, // '11' -> stamped 1
        { fileIndex: 0, pageIndex: 1, rotation: 0, skipped: true }, // '12' -> skipped, not stamped
        { fileIndex: 0, pageIndex: 2, rotation: 0, skipped: false }, // '13' -> stamped 2
      ];

      const blob = await mergePdfs(files, { plan, addPageNumbers: true });

      const { pageCount, pageTexts } = await getPdfPageTexts(blob);
      expect(pageCount).toBe(2);
      expect(pageTexts[0]).toContain('11');
      expect(pageTexts[0]).toContain('1');
      expect(pageTexts[1]).toContain('13');
      expect(pageTexts[1]).toContain('2');
    });

    it('rejects with MergeFileError reason "encrypted" and the right fileIndex for an encrypted source', async () => {
      const files = [getFixtureFile('num-1.pdf'), await makeEncryptedFile()];

      const failure = mergePdfs(files);
      await expect(failure).rejects.toBeInstanceOf(MergeFileError);
      await expect(failure).rejects.toMatchObject({
        name: 'MergeFileError',
        reason: 'encrypted',
        fileIndex: 1,
      });
    });

    it('rejects with MergeFileError reason "unreadable" and the right fileIndex for garbage bytes', async () => {
      const files = [
        getFixtureFile('num-1.pdf'),
        new File(['not a pdf at all'], 'garbage.pdf', { type: 'application/pdf' }),
      ];

      await expect(mergePdfs(files)).rejects.toMatchObject({
        name: 'MergeFileError',
        reason: 'unreadable',
        fileIndex: 1,
      });
    });

    it('rejects immediately with an AbortError when the signal is already aborted', async () => {
      const files = [getFixtureFile('num-1.pdf')];
      const controller = new AbortController();
      controller.abort();

      await expect(mergePdfs(files, {}, undefined, controller.signal)).rejects.toMatchObject({
        name: 'AbortError',
      });
    });

    it('aborting from inside the onProgress callback of the first file stops before the second file is processed', async () => {
      const files = [getFixtureFile('num-1.pdf'), getFixtureFile('num-2.pdf')];
      const controller = new AbortController();
      let secondFileTouched = false;
      const trackedFiles = [
        files[0],
        {
          // A File-like stand-in that would flip a flag if mergePdfs ever
          // reads it - proves the second file is never touched once the
          // signal is aborted after the first file's progress callback.
          arrayBuffer: async () => {
            secondFileTouched = true;
            return files[1].arrayBuffer();
          },
        },
      ];

      await expect(
        mergePdfs(trackedFiles, {}, () => controller.abort(), controller.signal),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(secondFileTouched).toBe(false);
    });

    it('sets the document title when options.title is given', async () => {
      const files = [getFixtureFile('num-1.pdf'), getFixtureFile('num-2.pdf')];
      const blob = await mergePdfs(files, { title: 'My Merged File' });

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const readBack = await PDFDocument.load(bytes);
      expect(readBack.getTitle()).toBe('My Merged File');
    });

    it('inspectPdf reports page count and encrypted status without needing a password', async () => {
      const file = getFixtureFile('num-5.pdf');
      const info = await inspectPdf(file, 0);
      expect(info.pageCount).toBe(5);
      expect(info.encrypted).toBe(false);
    });

    it('inspectPdf reports encrypted: true for an encrypted file, resolving rather than rejecting', async () => {
      const file = await makeEncryptedFile();
      const info = await inspectPdf(file, 0);
      expect(info.encrypted).toBe(true);
      expect(info.pageCount).toBe(1);
    });

    it('inspectPdf rejects with MergeFileError reason "unreadable" for garbage bytes', async () => {
      const file = new File(['garbage'], 'garbage.pdf', { type: 'application/pdf' });
      await expect(inspectPdf(file, 2)).rejects.toMatchObject({
        name: 'MergeFileError',
        reason: 'unreadable',
        fileIndex: 2,
      });
    });

    it('mergedFileName builds the "merged_<first>.pdf" download name', () => {
      expect(mergedFileName('Invoice 2024-03-01.pdf', 3)).toBe('merged_Invoice 2024-03-01.pdf');
    });
  });
});
