import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName, PDFString } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { MergeFileError, inspectPdf, mergePdfs, mergedFileName, resolvePdfCreationDate } from './merge.js';

// PdfMergeTool.test.tsx mocks merge.js outright, so nothing in the component
// suite ever runs this file's real pdf-lib calls - see the same gap noted for
// redact.test.js. These fixtures are single-page PDFs whose one page reads its
// own file number ("num-3.pdf" -> "3"), which makes both order and content
// checkable from the merged output without a canvas/pdf.js round trip.
describe('mergePdfs library integration with real fixtures', () => {
  function getFixtureFile(name) {
    const filePath = path.resolve(__dirname, '../../lib/__fixtures__', name);
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

    it('inspectPdf opens a file whose /CreationDate is empty or malformed, with no date', async () => {
      // A real Clalit form carries `/CreationDate ()`; pdf-lib's getCreationDate throws on it.
      for (const value of ['', 'not a date']) {
        const doc = await PDFDocument.create();
        doc.addPage();
        doc.context.lookup(doc.context.trailerInfo.Info).set(PDFName.of('CreationDate'), PDFString.of(value));
        const file = new File([await doc.save()], 'empty-date.pdf', { type: 'application/pdf' });
        await expect(inspectPdf(file, 0)).resolves.toEqual({ pageCount: 1, encrypted: false, creationDate: null });
      }
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
      expect(mergedFileName('Invoice 2024-03-01.pdf')).toBe('merged_Invoice 2024-03-01.pdf');
    });

    it('never puts a "+" in the merged name, even when the source name carries one', () => {
      expect(mergedFileName('a+b.pdf')).toBe('merged_ab.pdf');
      expect(mergedFileName('Q1 + Q2 report.pdf')).toBe('merged_Q1 Q2 report.pdf');
      expect(mergedFileName('+.pdf')).toBe('merged_merged.pdf');
    });
  });

  describe('MERGE-15 bookmarks (one outline entry per source file)', () => {
    // Walks the /Outlines chain the same way a viewer's bookmark panel does:
    // from /First, following /Next, reading each item's decoded title and its
    // /Dest's target page ref.
    function readOutlineChain(pdfDoc) {
      const outlinesRef = pdfDoc.catalog.get(PDFName.of('Outlines'));
      if (!outlinesRef) return null;
      const outlines = pdfDoc.context.lookup(outlinesRef);
      const items = [];
      let currentRef = outlines.get(PDFName.of('First'));
      while (currentRef) {
        const item = pdfDoc.context.lookup(currentRef);
        const dest = item.get(PDFName.of('Dest'));
        items.push({
          ref: currentRef,
          title: item.get(PDFName.of('Title')).decodeText(),
          destPageRef: dest.get(0),
          prev: item.get(PDFName.of('Prev')),
          next: item.get(PDFName.of('Next')),
        });
        currentRef = item.get(PDFName.of('Next'));
      }
      return { count: outlines.get(PDFName.of('Count'))?.asNumber(), items };
    }

    it('writes one bookmark per surviving source file, titled and ordered by first output page, with a skipped page, a fully-skipped file, and a Hebrew name accounted for', async () => {
      // Four source files:
      //  - num-5.pdf (5 pages, '11'..'15'): only its page 1 ('12') survives -
      //    page 0 is explicitly skipped, so its bookmark must target '12',
      //    not '11'.
      //  - a Hebrew-named copy of num-2.pdf's one page ('2'): proves the
      //    title round-trips a non-Latin script.
      //  - num-3.pdf (1 page, '3').
      //  - num-4.pdf (1 page, '4'): every one of its plan entries is
      //    skipped, so it must get no bookmark at all.
      const files = [
        getFixtureFile('num-5.pdf'),
        (() => {
          const buffer = fs.readFileSync(path.resolve(__dirname, '../../lib/__fixtures__/num-2.pdf'));
          return new File([buffer], 'דוח מס.pdf', { type: 'application/pdf' });
        })(),
        getFixtureFile('num-3.pdf'),
        getFixtureFile('num-4.pdf'),
      ];

      // Plan order deliberately interleaves files and puts num-3.pdf first in
      // OUTPUT order despite being third in the files array, and skips
      // num-5.pdf's first page so its kept pages land non-contiguously
      // relative to file order.
      const plan = [
        { fileIndex: 2, pageIndex: 0, rotation: 0, skipped: false }, // '3' -> output page 0
        { fileIndex: 0, pageIndex: 0, rotation: 0, skipped: true }, // '11', skipped
        { fileIndex: 1, pageIndex: 0, rotation: 0, skipped: false }, // '2' -> output page 1
        { fileIndex: 3, pageIndex: 0, rotation: 0, skipped: true }, // '4', skipped - only entry for file 3
        { fileIndex: 0, pageIndex: 1, rotation: 0, skipped: false }, // '12' -> output page 2
      ];

      const blob = await mergePdfs(files, { plan, bookmarks: true });
      const { pageTexts } = await getPdfPageTexts(blob);
      expect(pageTexts).toEqual(['3', '2', '12']);

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const reloaded = await PDFDocument.load(bytes);
      const outline = readOutlineChain(reloaded);

      expect(outline.count).toBe(3);
      expect(outline.items).toHaveLength(3);
      expect(outline.items.map((item) => item.title)).toEqual(['num-3', 'דוח מס', 'num-5']);
      // num-4.pdf (fully skipped) never appears.
      expect(outline.items.some((item) => item.title === 'num-4')).toBe(false);

      const expectedPageRefs = [0, 1, 2].map((i) => reloaded.getPage(i).ref.toString());
      expect(outline.items.map((item) => item.destPageRef.toString())).toEqual(expectedPageRefs);

      // Prev/Next chain: first has no Prev, last has no Next, middle links
      // both ways.
      expect(outline.items[0].prev).toBeUndefined();
      expect(outline.items[0].next.toString()).toBe(outline.items[1].ref.toString());
      expect(outline.items[1].prev.toString()).toBe(outline.items[0].ref.toString());
      expect(outline.items[1].next.toString()).toBe(outline.items[2].ref.toString());
      expect(outline.items[2].prev.toString()).toBe(outline.items[1].ref.toString());
      expect(outline.items[2].next).toBeUndefined();
    });

    it('bookmarks: true with no explicit plan writes one entry per file in file order', async () => {
      const files = [getFixtureFile('num-1.pdf'), getFixtureFile('num-2.pdf'), getFixtureFile('num-3.pdf')];
      const blob = await mergePdfs(files, { bookmarks: true });

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const reloaded = await PDFDocument.load(bytes);
      const outline = readOutlineChain(reloaded);

      expect(outline.count).toBe(3);
      expect(outline.items.map((item) => item.title)).toEqual(['num-1', 'num-2', 'num-3']);
    });

    it('writes no outline when only one file made it into the output (a one-entry outline names the whole document)', async () => {
      const blob = await mergePdfs([getFixtureFile('num-2.pdf')], { bookmarks: true });

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const reloaded = await PDFDocument.load(bytes);
      expect(reloaded.catalog.get(PDFName.of('Outlines'))).toBeUndefined();
    });

    it('writes no /Outlines by default (the flag is off until Shlomi confirms the sample)', async () => {
      const files = [getFixtureFile('num-1.pdf'), getFixtureFile('num-2.pdf')];
      const blob = await mergePdfs(files);

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const reloaded = await PDFDocument.load(bytes);
      expect(reloaded.catalog.get(PDFName.of('Outlines'))).toBeUndefined();
    });
  });

  describe('MERGE-22 photos as pages', () => {
    function getPhotoFile(name, type) {
      const buffer = fs.readFileSync(path.resolve(__dirname, '../../lib/__fixtures__', name));
      return new File([buffer], name, { type });
    }
    const jpg = () => getPhotoFile('photo-1.jpg', 'image/jpeg');
    const png = () => getPhotoFile('photo-2.png', 'image/png');

    it('puts photo pages where the plan says, sized to the photo pixels, with rotation applied', async () => {
      const files = [getFixtureFile('num-2.pdf'), jpg(), png()];
      const plan = [
        { fileIndex: 2, pageIndex: 0, rotation: 90, skipped: false },
        { fileIndex: 0, pageIndex: 0, rotation: 0, skipped: false },
        { fileIndex: 1, pageIndex: 0, rotation: 0, skipped: false },
      ];
      const blob = await mergePdfs(files, { plan });
      const doc = await PDFDocument.load(await blob.arrayBuffer());
      const pages = doc.getPages();
      expect(pages).toHaveLength(3);
      expect(pages[0].getSize()).toEqual({ width: 40, height: 80 });
      expect(pages[0].getRotation().angle).toBe(90);
      expect(pages[2].getSize()).toEqual({ width: 60, height: 40 });
      expect(pages[1].getRotation().angle).toBe(0);
    });

    it('adds the user rotation to the EXIF rotation of a photo page', async () => {
      const exif = getPhotoFile('photo-exif-6.jpg', 'image/jpeg');
      const plan = [{ fileIndex: 0, pageIndex: 0, rotation: 90, skipped: false }];
      const blob = await mergePdfs([exif], { plan });
      const doc = await PDFDocument.load(await blob.arrayBuffer());
      expect(doc.getPages()[0].getRotation().angle).toBe(180);
    });

    it('merges photos without a plan, in file order, and numbers their pages', async () => {
      const blob = await mergePdfs([jpg(), getFixtureFile('num-2.pdf'), png()], { addPageNumbers: true });
      const { pageCount, pageTexts } = await getPdfPageTexts(blob);
      expect(pageCount).toBe(3);
      expect(pageTexts[0]).toBe('1');
      expect(pageTexts[1]).toContain('2');
      expect(pageTexts[2]).toBe('3');
    });

    it('names bookmarks for photos without the extension', async () => {
      const blob = await mergePdfs([jpg(), png(), getFixtureFile('num-2.pdf')], { bookmarks: true });
      const reloaded = await PDFDocument.load(await blob.arrayBuffer());
      const outlines = reloaded.context.lookup(reloaded.catalog.get(PDFName.of('Outlines')));
      const titles = [];
      let ref = outlines.get(PDFName.of('First'));
      while (ref) {
        const item = reloaded.context.lookup(ref);
        titles.push(item.get(PDFName.of('Title')).decodeText());
        ref = item.get(PDFName.of('Next'));
      }
      expect(titles).toEqual(['photo-1', 'photo-2', 'num-2']);
    });

    it('inspectPdf reports a photo as one unencrypted page', async () => {
      expect(await inspectPdf(jpg())).toEqual({ pageCount: 1, encrypted: false, creationDate: null });
      expect(await inspectPdf(png())).toEqual({ pageCount: 1, encrypted: false, creationDate: null });
    });

    it('inspects a photo by its signature without embedding it', async () => {
      const embedPng = vi.spyOn(PDFDocument.prototype, 'embedPng');
      const embedJpg = vi.spyOn(PDFDocument.prototype, 'embedJpg');
      try {
        await inspectPdf(jpg());
        await inspectPdf(png());
        expect(embedPng).not.toHaveBeenCalled();
        expect(embedJpg).not.toHaveBeenCalled();
      } finally {
        embedPng.mockRestore();
        embedJpg.mockRestore();
      }
    });

    it('rejects a .jpg or .png holding PDF bytes from inspectPdf', async () => {
      const pdfBytes = fs.readFileSync(path.resolve(__dirname, '../../lib/__fixtures__/num-1.pdf'));
      const fakeJpg = new File([pdfBytes], 'fake.jpg', { type: 'image/jpeg' });
      const fakePng = new File([pdfBytes], 'fake.png', { type: 'image/png' });
      await expect(inspectPdf(fakeJpg, 2)).rejects.toMatchObject({ fileIndex: 2, reason: 'unreadable' });
      await expect(inspectPdf(fakePng)).rejects.toMatchObject({ reason: 'unreadable' });
    });

    it('rejects a corrupt .jpg as unreadable, from inspectPdf and mergePdfs', async () => {
      const bad = new File(['not a jpeg'], 'bad.jpg', { type: 'image/jpeg' });
      await expect(inspectPdf(bad, 4)).rejects.toMatchObject({ name: 'MergeFileError', fileIndex: 4, reason: 'unreadable' });
      await expect(mergePdfs([getFixtureFile('num-1.pdf'), bad])).rejects.toMatchObject({ fileIndex: 1, reason: 'unreadable' });
    });
  });
});
