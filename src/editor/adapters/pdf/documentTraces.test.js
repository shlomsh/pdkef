import { describe, it, expect, vi } from 'vitest';
import { PDFDocument, PDFName, PDFString, PDFRef } from '@cantoo/pdf-lib';
import {
  readDocumentTraces, applyDetailEdits, copyDocumentDetails, reachesPage, removeXmpThumbnails,
} from './documentTraces.js';
import { attachmentDetailId } from './detailEdits.js';
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

  it('deletes changed only', async () => {
    const { traces } = await tracesAfter({ changed: del });
    expect(traces.modDate).toBeNull();
    expect(traces.creationDate).not.toBeNull();
  });

  it('deleting created takes the changed date too, a row the person may never have seen', async () => {
    const { traces } = await tracesAfter({ created: del });
    expect(traces.creationDate).toBeNull();
    expect(traces.modDate).toBeNull();
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
  it('copies Info, XMP, scripts (never PieceInfo) and document attachments, not page-level items', async () => {
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
    expect(t.pieceInfo).toBe(false);
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

describe('reachesPage', () => {
  const setup = async () => {
    const doc = await PDFDocument.create({ updateMetadata: false });
    const page = doc.addPage([100, 100]);
    return { doc, ctx: doc.context, page };
  };

  it('is false for plain values and a stream with no page link', async () => {
    const { ctx } = await setup();
    expect(reachesPage(ctx, PDFString.of('x'))).toBe(false);
    expect(reachesPage(ctx, ctx.obj({ A: { B: [1, 2, 'c'] } }))).toBe(false);
    expect(reachesPage(ctx, ctx.register(ctx.stream('x', { Type: 'EmbeddedFile', Subtype: 'text#2Fplain' })))).toBe(false);
  });

  it('is true through a ref, an array and a stream dict to a page, /Pages, an annotation, the catalog or a page /Contents', async () => {
    const { doc, ctx, page } = await setup();
    expect(reachesPage(ctx, page.ref)).toBe(true);
    expect(reachesPage(ctx, ctx.obj([{ Deep: [page.ref] }]))).toBe(true);
    expect(reachesPage(ctx, ctx.register(ctx.stream('x', { Via: page.ref })))).toBe(true);
    expect(reachesPage(ctx, ctx.obj({ P: doc.catalog.get(PDFName.of('Pages')) }))).toBe(true);
    expect(reachesPage(ctx, ctx.obj({ A: ctx.obj({ Subtype: 'Link', P: page.ref }) }))).toBe(true);
    expect(reachesPage(ctx, ctx.obj({ A: ctx.obj({ Type: 'Annot', Subtype: 'Text' }) }))).toBe(true);
    expect(reachesPage(ctx, ctx.obj({ C: ctx.trailerInfo.Root }))).toBe(true);
    page.drawText('hi', { x: 1, y: 1 });
    expect(reachesPage(ctx, ctx.obj({ C: page.node.get(PDFName.of('Contents')) }))).toBe(true);
  });

  it('terminates on a cycle', async () => {
    const { ctx } = await setup();
    const a = ctx.obj({});
    const ref = ctx.register(a);
    a.set(PDFName.of('Self'), ref);
    expect(reachesPage(ctx, ref)).toBe(false);
  });
});

describe('copyDocumentDetails robustness', () => {
  it('scans the source document once, however many details it copies (2,000 pages took seconds when every value rescanned it)', async () => {
    const src = await PDFDocument.create({ updateMetadata: false });
    for (let i = 0; i < 50; i++) src.addPage([100, 100]).drawText('x', { x: 1, y: 1 });
    for (let i = 0; i < 40; i++) await src.attach(new Uint8Array([i % 256]), `f${i}.txt`, { mimeType: 'text/plain' });
    for (let i = 0; i < 10; i++) src.getInfoDict().set(PDFName.of(`Custom${i}`), PDFString.of(`v${i}`));
    await src.flush();
    const target = await PDFDocument.create({ updateMetadata: false });
    const scan = vi.spyOn(src.context, 'enumerateIndirectObjects');
    copyDocumentDetails(src, target);
    expect(scan.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('skips a dangling reference instead of crashing and copies the other Info keys', async () => {
    const src = await PDFDocument.create({ updateMetadata: false });
    src.addPage([100, 100]);
    src.setTitle('Kept');
    src.getInfoDict().set(PDFName.of('Custom'), PDFRef.of(9999, 0));
    src.catalog.set(PDFName.of('Metadata'), PDFRef.of(9998, 0));
    src.catalog.set(PDFName.of('OpenAction'), PDFRef.of(9997, 0));
    const target = await PDFDocument.create({ updateMetadata: false });
    expect(() => copyDocumentDetails(src, target)).not.toThrow();
    expect(target.getTitle()).toBe('Kept');
    expect(target.getInfoDict().has(PDFName.of('Custom'))).toBe(false);
  });
});

describe('removeXmpThumbnails', () => {
  it('stays linear on 50,000 unclosed <xmp:Thumbnails> starts and leaves the packet unchanged', () => {
    const packet = '<x:xmpmeta>' + '<xmp:Thumbnails>'.repeat(50000) + '</x:xmpmeta>';
    const t0 = performance.now();
    const out = removeXmpThumbnails(packet);
    const ms = performance.now() - t0;
    console.log(`removeXmpThumbnails 50,000 unclosed: ${Math.round(ms)}ms`);
    expect(ms).toBeLessThan(500);
    expect(out).toBe(packet);
  });

  it('removes closed, self-closed and xap: elements, and xmpGImg:image inside xmpTPg page info', () => {
    const t = '<a/><xmp:Thumbnails><b/></xmp:Thumbnails><c/><xap:Thumbnails/><d/><xmpTPg:x><xmpGImg:image>QQ==</xmpGImg:image></xmpTPg:x><e/>';
    const out = removeXmpThumbnails(t);
    expect(out).toBe('<a/><c/><d/><xmpTPg:x></xmpTPg:x><e/>');
  });
});
