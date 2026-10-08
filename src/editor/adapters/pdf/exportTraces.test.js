// RED-59: what a saved export carries of the source's details, end to end in Node:
// untouched keeps everything but /Thumb, and each edit reads back.
// Delete is run for real; the flattened path through `assemble`, which holds
// everything `redactPdf` does after the canvas work.
import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, decodePDFRawStream } from '@cantoo/pdf-lib';
import { deleteObjectsFromPdf } from './deleteObjects.js';
import { assemble } from './redact.js';
import { readDocumentTraces, attachmentDetailId } from './documentTraces.js';
import { buildTracesFixture } from './tracesFixture.test-helper.js';

const JPEG = Uint8Array.from(Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
));

const paths = {
  async delete(bytes, options) {
    const blob = await deleteObjectsFromPdf(bytes, [], undefined, options);
    return new Uint8Array(await blob.arrayBuffer());
  },
  async flattened(bytes, options) {
    const source = await PDFDocument.load(bytes, { updateMetadata: false });
    return new Uint8Array(await assemble(source, new Map([[0, { jpeg: JPEG, width: 300, height: 300 }]]), options));
  },
};

async function sourceBytes() {
  return (await buildTracesFixture()).save();
}

const del = { action: 'delete' };
const reread = async (out) => readDocumentTraces(await PDFDocument.load(out, { updateMetadata: false }));
const names = (t) => [...new Set(t.attachments.map((a) => a.name))].sort();

describe.each(Object.keys(paths))('%s export', (path) => {
  const run = (options) => sourceBytes().then((b) => paths[path](b, options));
  // The flattened path copies page 2, so its comment attachment is there too;
  // page 1 became a picture, so its page script and thumbnail are not.
  const pageScripts = path === 'delete' ? [0] : [];

  it('untouched keeps every detail as it came, except the cached thumbnails', async () => {
    const t = await reread(await run());
    expect(t.title).toBe('The Title');
    expect(t.author).toBe('The Author');
    expect(t.subject).toBe('The Subject');
    expect(t.keywords).toBe('alpha beta');
    expect(t.creator).toBe('Some Creator');
    expect(t.producer).toBe('Some Producer');
    expect(t.creationDate).toEqual({ iso: '2026-03-07T14:15:02', offsetMinutes: 0 });
    expect(t.modDate?.iso).toBe('2026-03-08T09:00:00');
    expect(t.otherInfoKeys.sort()).toEqual(['Company', 'SourceModified']);
    expect(t.xmp).toEqual({ present: true, hasHistory: true });
    expect(names(t)).toEqual(['catalog-af.txt', 'comment.txt', 'drop.txt', 'keep.txt']);
    expect(t.scripts).toEqual({ document: true, pages: pageScripts });
    expect(t.thumbnails).toEqual([]);
  });

  it('untouched keeps a catalog /PieceInfo', async () => {
    const fixture = await buildTracesFixture();
    fixture.doc.catalog.set(PDFName.of('PieceInfo'), fixture.doc.context.obj({ App: { Private: 'x' } }));
    expect((await reread(await paths[path](await fixture.save()))).pieceInfo).toBe(true);
  });

  it('untouched keeps the bytes of a document attachment', async () => {
    const out = await run();
    const reloaded = await PDFDocument.load(out, { updateMetadata: false });
    const names = reloaded.catalog.lookup(PDFName.of('Names'));
    const tree = names.lookup(PDFName.of('EmbeddedFiles'));
    const kids = tree.lookup(PDFName.of('Kids'));
    const leaf = kids ? reloaded.context.lookup(kids.get(0)) : tree;
    const spec = reloaded.context.lookup(leaf.lookup(PDFName.of('Names')).get(1));
    const stream = reloaded.context.lookup(spec.lookup(PDFName.of('EF')).get(PDFName.of('F')));
    expect(Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')).toBe('KEEP_PAYLOAD');
  });

  it.each([
    ['title', 'title'], ['author', 'author'], ['subject', 'subject'], ['keywords', 'keywords'],
    ['created', 'creationDate'], ['changed', 'modDate'],
  ])('deleting %s reads back absent', async (id, key) => {
    const t = await reread(await run({ details: { [id]: del } }));
    expect(t[key]).toBeNull();
  });

  it('deleting made reads back no Creator or Producer', async () => {
    const t = await reread(await run({ details: { made: del } }));
    expect(t.creator).toBeNull();
    expect(t.producer).toBeNull();
  });

  it.each([['title', 'title'], ['author', 'author'], ['subject', 'subject'], ['keywords', 'keywords']])(
    'altering %s reads back the new value, Hebrew too',
    async (id, key) => {
      for (const value of ['Declaration', 'הצהרה']) {
        const t = await reread(await run({ details: { [id]: { action: 'alter', value } } }));
        expect(t[key]).toBe(value);
      }
    },
  );

  it('altering made sets Creator and drops Producer', async () => {
    const t = await reread(await run({ details: { made: { action: 'alter', value: 'כתב' } } }));
    expect(t.creator).toBe('כתב');
    expect(t.producer).toBeNull();
  });

  it('a text edit takes the hidden copy with it', async () => {
    const t = await reread(await run({ details: { title: del } }));
    expect(t.xmp.present).toBe(false);
    expect(t.otherInfoKeys).toEqual([]);
    expect(t.pageDetails).toEqual([]);
    expect(t.author).toBe('The Author');
  });

  it('deleting a document attachment reads back gone, the others stay', async () => {
    const t = await reread(await run({ details: { [attachmentDetailId({ name: 'drop.txt' })]: del } }));
    expect(names(t)).toEqual(['catalog-af.txt', 'comment.txt', 'keep.txt']);
  });

  it('deleting the /AF-only attachment reads back gone', async () => {
    const t = await reread(await run({ details: { [attachmentDetailId({ name: 'catalog-af.txt' })]: del } }));
    expect(names(t)).toEqual(['comment.txt', 'drop.txt', 'keep.txt']);
  });

  it('the comment attachment is readable untouched and gone when deleted', async () => {
    expect(names(await reread(await run()))).toContain('comment.txt');
    const t = await reread(await run({ details: { [attachmentDetailId({ name: 'comment.txt', pageIndex: 1 })]: del } }));
    expect(names(t)).not.toContain('comment.txt');
    expect(names(t)).toContain('keep.txt');
  });

  it('deleting scripts reads back none', async () => {
    const t = await reread(await run({ details: { scripts: del } }));
    expect(t.scripts).toEqual({ document: false, pages: [] });
  });

  it('deleting hidden reads back no XMP, PieceInfo, other Info keys or page details', async () => {
    const fixture = await buildTracesFixture();
    fixture.doc.catalog.set(PDFName.of('PieceInfo'), fixture.doc.context.obj({ App: { Private: 'x' } }));
    const t = await reread(await paths[path](await fixture.save(), { details: { hidden: del } }));
    expect(t.xmp.present).toBe(false);
    expect(t.pieceInfo).toBe(false);
    expect(t.otherInfoKeys).toEqual([]);
    expect(t.pageDetails).toEqual([]);
    expect(t.title).toBe('The Title');
  });

  it('runs finish on the output before the edits: a comment finish removes on page 2 is gone', async () => {
    const dropText = (doc) => {
      const annots = doc.getPage(1).node.lookup(PDFName.of('Annots'));
      for (let i = annots.size() - 1; i >= 0; i--) {
        const a = doc.context.lookup(annots.get(i));
        if (a.get(PDFName.of('Subtype')) === PDFName.of('Text')) annots.remove(i);
      }
    };
    const out = await run({ finish: dropText });
    const reloaded = await PDFDocument.load(out, { updateMetadata: false });
    const annots = reloaded.getPage(1).node.lookup(PDFName.of('Annots'));
    const subtypes = [];
    for (let i = 0; annots && i < annots.size(); i++) {
      subtypes.push(reloaded.context.lookup(annots.get(i)).get(PDFName.of('Subtype')).asString());
    }
    expect(subtypes).not.toContain('/Text');
  });
});
