import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { readDocumentTraces, stripDocumentTraces, hasNoTraces } from './documentTraces.js';
import { buildTracesFixture, SOURCE_ID_HEX } from './tracesFixture.test-helper.js';

const names = (t) => t.attachments.map((a) => a.name).sort();

describe('readDocumentTraces', () => {
  it('reads the Info dict: eight standard keys decoded, other keys by name only', async () => {
    const { doc } = await buildTracesFixture();
    const t = readDocumentTraces(doc);
    expect(t.title).toBe('The Title');
    expect(t.author).toBe('The Author');
    expect(t.producer).toBe('Some Producer');
    expect(t.creator).toBe('Some Creator');
    expect(t.subject).toBeNull();
    expect(t.creationDate).toEqual({ iso: '2026-03-07T14:15:02', offsetMinutes: 0 });
    expect(t.modDate?.iso).toBe('2026-03-08T09:00:00');
    expect(t.otherInfoKeys.sort()).toEqual(['Company', 'SourceModified']);
  });

  it('reads the catalog XMP and whether it holds a history', async () => {
    const { doc } = await buildTracesFixture();
    expect(readDocumentTraces(doc).xmp).toEqual({ present: true, hasHistory: true });
  });

  it('finds attachments in the name tree (through Kids), the catalog /AF and file-attachment comments', async () => {
    const { doc } = await buildTracesFixture();
    const t = readDocumentTraces(doc);
    expect(names(t)).toEqual(['catalog-af.txt', 'comment.txt', 'drop.txt', 'keep.txt']);
    expect(t.attachments.find((a) => a.name === 'comment.txt').pageIndex).toBe(1);
  });

  it('finds document scripts and page scripts', async () => {
    const { doc } = await buildTracesFixture();
    expect(readDocumentTraces(doc).scripts).toEqual({ document: true, pages: [0] });
  });

  it('finds thumbnails', async () => {
    const { doc } = await buildTracesFixture();
    expect(readDocumentTraces(doc).thumbnails).toEqual([0]);
  });

  it('finds page details on the page and on an image nested inside a form it draws', async () => {
    const { doc } = await buildTracesFixture();
    expect(readDocumentTraces(doc).pageDetails).toEqual([1]);
  });

  it('finds an OpenAction script on its own', async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage();
    doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj({ S: 'JavaScript', JS: 'app.alert(1)' }));
    expect(readDocumentTraces(doc).scripts.document).toBe(true);
  });
});

describe('stripDocumentTraces', () => {
  const strip = async (options) => {
    const { doc } = await buildTracesFixture();
    stripDocumentTraces(doc, options);
    return { doc, traces: readDocumentTraces(doc) };
  };

  it('removes every Info key, custom ones too', async () => {
    const { traces } = await strip();
    expect(traces.title).toBeNull();
    expect(traces.author).toBeNull();
    expect(traces.creationDate).toBeNull();
    expect(traces.otherInfoKeys).toEqual([]);
  });

  it('removes the catalog XMP', async () => {
    expect((await strip()).traces.xmp.present).toBe(false);
  });

  it('removes attachments of every shape', async () => {
    const { doc, traces } = await strip();
    expect(traces.attachments).toEqual([]);
    expect(doc.catalog.get(PDFName.of('AF'))).toBeUndefined();
  });

  it('removes document and page scripts', async () => {
    const { traces } = await strip();
    expect(traces.scripts).toEqual({ document: false, pages: [] });
  });

  it('removes thumbnails', async () => {
    expect((await strip()).traces.thumbnails).toEqual([]);
  });

  it('removes page and object details', async () => {
    expect((await strip()).traces.pageDetails).toEqual([]);
  });

  it('keeps an attachment named in keepAttachments, and drops the other', async () => {
    const { traces } = await strip({ keepAttachments: ['keep.txt'] });
    expect(names(traces)).toEqual(['keep.txt']);
    expect(hasNoTraces(traces)).toBe(false);
  });

  it('keeps a file-attachment comment named in keepAttachments', async () => {
    const { traces } = await strip({ keepAttachments: ['comment.txt'] });
    expect(names(traces)).toEqual(['comment.txt']);
  });

  it('gives a fresh random ID each time, unlike the source ID', async () => {
    const idOf = async () => {
      const { doc } = await buildTracesFixture();
      stripDocumentTraces(doc);
      return doc.context.trailerInfo.ID.toString();
    };
    const a = await idOf();
    const b = await idOf();
    expect(a).not.toBe(b);
    expect(a).not.toContain(SOURCE_ID_HEX);
  });

  it('draws the ID from the injected randomBytes', async () => {
    const { doc } = await buildTracesFixture();
    stripDocumentTraces(doc, { randomBytes: (n) => new Uint8Array(n).fill(0xab) });
    expect(doc.context.trailerInfo.ID.toString()).toContain('AB'.repeat(16));
  });
});

describe('hasNoTraces', () => {
  it('is true for a bare document', async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage();
    expect(hasNoTraces(readDocumentTraces(doc))).toBe(true);
  });

  it('is true after a strip of the full fixture', async () => {
    const { doc } = await buildTracesFixture();
    stripDocumentTraces(doc);
    expect(hasNoTraces(readDocumentTraces(doc))).toBe(true);
  });

  it('is false for a single thumbnail', async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    const page = doc.addPage();
    page.node.set(PDFName.of('Thumb'), doc.context.register(doc.context.stream(new Uint8Array(1))));
    expect(hasNoTraces(readDocumentTraces(doc))).toBe(false);
  });
});

describe('one attachment, one row', () => {
  it('lists a file pdf-lib attached (name tree and /AF) once', async () => {
    const { PDFDocument } = await import('@cantoo/pdf-lib');
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage([100, 100]);
    await doc.attach(new TextEncoder().encode('x'), 'once.txt', { mimeType: 'text/plain' });
    const reloaded = await PDFDocument.load(await doc.save(), { updateMetadata: false });
    expect(readDocumentTraces(reloaded).attachments).toEqual([{ name: 'once.txt' }]);
  });
});
