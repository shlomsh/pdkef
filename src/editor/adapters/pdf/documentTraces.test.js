import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import {
  readDocumentTraces, applyDetailEdits, copyDocumentDetails, expandDetailEdits, attachmentDetailId,
  TEXT_DETAIL_IDS, DATE_DETAIL_IDS,
} from './documentTraces.js';
import { buildTracesFixture } from './tracesFixture.test-helper.js';

const names = (t) => t.attachments.map((a) => a.name).sort();

describe('readDocumentTraces', () => {
  it('reads the Info dict: eight standard keys decoded, other keys by name only', async () => {
    const { doc } = await buildTracesFixture();
    const t = readDocumentTraces(doc);
    expect(t.title).toBe('The Title');
    expect(t.author).toBe('The Author');
    expect(t.producer).toBe('Some Producer');
    expect(t.creator).toBe('Some Creator');
    expect(t.subject).toBe('The Subject');
    expect(t.keywords).toBe('alpha beta');
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

  it('reads a catalog /PieceInfo, and none on a bare document', async () => {
    const { doc } = await buildTracesFixture();
    expect(readDocumentTraces(doc).pieceInfo).toBe(false);
    doc.catalog.set(PDFName.of('PieceInfo'), doc.context.obj({ App: { Private: 'x' } }));
    expect(readDocumentTraces(doc).pieceInfo).toBe(true);
  });

  it('finds an OpenAction script on its own', async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    doc.addPage();
    doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj({ S: 'JavaScript', JS: 'app.alert(1)' }));
    expect(readDocumentTraces(doc).scripts.document).toBe(true);
  });
});

const del = { action: 'delete' };
const tracesAfter = async (edits) => {
  const { doc } = await buildTracesFixture();
  applyDetailEdits(doc, edits);
  return { doc, traces: readDocumentTraces(doc) };
};

describe('detail ids', () => {
  it('names the text and date ids and builds attachment ids', () => {
    expect(TEXT_DETAIL_IDS).toEqual(['title', 'author', 'subject', 'keywords', 'made']);
    expect(DATE_DETAIL_IDS).toEqual(['created', 'changed']);
    expect(attachmentDetailId({ name: 'a.txt' })).toBe('attachment::a.txt');
    expect(attachmentDetailId({ name: 'c.txt', pageIndex: 1 })).toBe('attachment:1:c.txt');
    expect(attachmentDetailId({ name: 'z.txt', pageIndex: 0 })).toBe('attachment:0:z.txt');
  });
});

describe('expandDetailEdits', () => {
  it('adds hidden for a text or date edit, and only then', () => {
    for (const id of [...TEXT_DETAIL_IDS, ...DATE_DETAIL_IDS]) {
      expect(expandDetailEdits({ [id]: del })).toEqual({ [id]: del, hidden: del });
    }
    expect(expandDetailEdits({})).toEqual({});
    expect(expandDetailEdits({ scripts: del })).toEqual({ scripts: del });
    expect(expandDetailEdits({ 'attachment::a.txt': del })).toEqual({ 'attachment::a.txt': del });
  });

  it('leaves an explicit hidden edit alone and does not mutate its input', () => {
    const edits = { title: del, hidden: del };
    expect(expandDetailEdits(edits)).toEqual(edits);
    const only = { title: del };
    expandDetailEdits(only);
    expect(only).toEqual({ title: del });
  });
});

describe('applyDetailEdits', () => {
  it('with no edits only the thumbnails go', async () => {
    const before = readDocumentTraces((await buildTracesFixture()).doc);
    const { traces } = await tracesAfter({});
    expect(traces.thumbnails).toEqual([]);
    expect(traces).toEqual({ ...before, thumbnails: [] });
  });

  it('leaves the trailer ID alone', async () => {
    const { doc } = await buildTracesFixture();
    const id = doc.context.trailerInfo.ID.toString();
    applyDetailEdits(doc, { title: del });
    expect(doc.context.trailerInfo.ID.toString()).toBe(id);
  });

  it.each([
    ['title', 'title'], ['author', 'author'], ['subject', 'subject'], ['keywords', 'keywords'],
  ])('deletes %s', async (id, key) => {
    const { traces } = await tracesAfter({ [id]: del });
    expect(traces[key]).toBeNull();
    expect(traces.creator).toBe('Some Creator');
  });

  it('deletes made: Creator and Producer', async () => {
    const { traces } = await tracesAfter({ made: del });
    expect(traces.creator).toBeNull();
    expect(traces.producer).toBeNull();
    expect(traces.title).toBe('The Title');
  });

  it.each([
    ['created', 'creationDate', 'modDate'], ['changed', 'modDate', 'creationDate'],
  ])('deletes %s only', async (id, gone, stays) => {
    const { traces } = await tracesAfter({ [id]: del });
    expect(traces[gone]).toBeNull();
    expect(traces[stays]).not.toBeNull();
  });

  it.each([
    ['title', 'The New Title'], ['author', 'שלום עולם'], ['subject', 'Sübject ✓'], ['keywords', 'כלב, cat'],
  ])('alters %s, Hebrew and accents included', async (id, value) => {
    const { traces } = await tracesAfter({ [id]: { action: 'alter', value } });
    expect(traces[id]).toBe(value);
  });

  it('alters made: Creator is the value, Producer goes', async () => {
    const { traces } = await tracesAfter({ made: { action: 'alter', value: 'המחבר' } });
    expect(traces.creator).toBe('המחבר');
    expect(traces.producer).toBeNull();
  });

  it('ignores alter on an id that only deletes', async () => {
    const alter = { action: 'alter', value: 'x' };
    const { traces } = await tracesAfter({ created: alter, scripts: alter, 'attachment::keep.txt': alter });
    expect(traces.creationDate).not.toBeNull();
    expect(traces.scripts.document).toBe(true);
    expect(names(traces)).toContain('keep.txt');
  });

  it('a text edit also removes the hidden copy (XMP, other Info keys, page details)', async () => {
    const { traces } = await tracesAfter({ title: { action: 'alter', value: 'x' } });
    expect(traces.xmp.present).toBe(false);
    expect(traces.otherInfoKeys).toEqual([]);
    expect(traces.pageDetails).toEqual([]);
    expect(traces.author).toBe('The Author');
  });

  it('deletes one name-tree attachment and keeps the rest', async () => {
    const { traces } = await tracesAfter({ [attachmentDetailId({ name: 'drop.txt' })]: del });
    expect(names(traces)).toEqual(['catalog-af.txt', 'comment.txt', 'keep.txt']);
  });

  it('deletes a catalog /AF attachment and removes the emptied /AF', async () => {
    const { doc, traces } = await tracesAfter({ [attachmentDetailId({ name: 'catalog-af.txt' })]: del });
    expect(names(traces)).toEqual(['comment.txt', 'drop.txt', 'keep.txt']);
    expect(doc.catalog.get(PDFName.of('AF'))).toBeUndefined();
  });

  it('deletes a comment attachment by its page, and not a same-named document one', async () => {
    const { traces } = await tracesAfter({ [attachmentDetailId({ name: 'comment.txt', pageIndex: 1 })]: del });
    expect(names(traces)).toEqual(['catalog-af.txt', 'drop.txt', 'keep.txt']);
  });

  it('removes the emptied EmbeddedFiles and Names when every name-tree file goes', async () => {
    const { doc, traces } = await tracesAfter({
      [attachmentDetailId({ name: 'keep.txt' })]: del,
      [attachmentDetailId({ name: 'drop.txt' })]: del,
      scripts: del,
    });
    expect(names(traces)).toEqual(['catalog-af.txt', 'comment.txt']);
    expect(doc.catalog.get(PDFName.of('Names'))).toBeUndefined();
  });

  it('deletes scripts: named, OpenAction, catalog and page AA', async () => {
    const { traces } = await tracesAfter({ scripts: del });
    expect(traces.scripts).toEqual({ document: false, pages: [] });
    expect(names(traces)).toContain('keep.txt');
  });

  it('keeps an OpenAction that is not a script when scripts go', async () => {
    const { doc } = await buildTracesFixture();
    doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj([doc.getPage(0).ref, 'Fit']));
    applyDetailEdits(doc, { scripts: del });
    expect(doc.catalog.get(PDFName.of('OpenAction'))).toBeDefined();
  });

  it('deletes hidden: XMP, PieceInfo, other Info keys, page and object details', async () => {
    const { doc } = await buildTracesFixture();
    doc.catalog.set(PDFName.of('PieceInfo'), doc.context.obj({ App: { Private: 'x' } }));
    applyDetailEdits(doc, { hidden: del });
    const traces = readDocumentTraces(doc);
    expect(traces.xmp.present).toBe(false);
    expect(traces.pieceInfo).toBe(false);
    expect(traces.otherInfoKeys).toEqual([]);
    expect(traces.pageDetails).toEqual([]);
    expect(traces.title).toBe('The Title');
    expect(traces.creator).toBe('Some Creator');
    expect(traces.creationDate).not.toBeNull();
    expect(traces.scripts.document).toBe(true);
    expect(names(traces)).toContain('keep.txt');
  });
});

describe('copyDocumentDetails', () => {
  it('copies Info, XMP, PieceInfo, scripts and document attachments, not page-level items', async () => {
    const { doc: source } = await buildTracesFixture();
    source.catalog.set(PDFName.of('PieceInfo'), source.context.obj({ App: { Private: 'x' } }));
    const target = await PDFDocument.create({ updateMetadata: false });
    target.addPage();
    copyDocumentDetails(source, target);
    const t = readDocumentTraces(target);
    expect(t.title).toBe('The Title');
    expect(t.author).toBe('The Author');
    expect(t.subject).toBe('The Subject');
    expect(t.keywords).toBe('alpha beta');
    expect(t.creator).toBe('Some Creator');
    expect(t.producer).toBe('Some Producer');
    expect(t.creationDate).toEqual(readDocumentTraces(source).creationDate);
    expect(t.modDate).toEqual(readDocumentTraces(source).modDate);
    expect(t.otherInfoKeys.sort()).toEqual(['Company', 'SourceModified']);
    expect(t.xmp).toEqual({ present: true, hasHistory: true });
    expect(t.pieceInfo).toBe(true);
    expect(t.scripts.document).toBe(true);
    expect(names(t)).toEqual(['catalog-af.txt', 'drop.txt', 'keep.txt']);
    expect(t.thumbnails).toEqual([]);
    expect(t.pageDetails).toEqual([]);
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
