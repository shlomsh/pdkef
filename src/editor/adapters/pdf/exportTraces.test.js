// RED-59: what a saved export carries of the source's details, end to end in Node:
// untouched keeps everything but /Thumb, and each edit reads back.
// Delete is run for real; the flattened path through `assemble`, which holds
// everything `redactPdf` does after the canvas work.
import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFDict, PDFRef, PDFStream, PDFString, StandardFonts, decodePDFRawStream } from '@cantoo/pdf-lib';
import { deleteObjectsFromPdf } from './deleteObjects.js';
import { assemble } from './redact.js';
import { readDocumentTraces } from './documentTraces.js';
import { attachmentDetailId } from './detailEdits.js';
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

const XMP_THUMBS = '<xmp:Thumbnails><rdf:Alt><rdf:li rdf:parseType="Resource"><xmpGImg:format>JPEG</xmpGImg:format>'
  + '<xmpGImg:image>QUJDREVGRw==</xmpGImg:image></rdf:li></rdf:Alt></xmp:Thumbnails>';
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

  it('untouched drops /PieceInfo everywhere and the XMP thumbnails, keeping the rest of the packet', async () => {
    const fixture = await buildTracesFixture();
    const ctx = fixture.doc.context;
    fixture.doc.catalog.set(PDFName.of('PieceInfo'), ctx.obj({ App: { Private: 'x' } }));
    fixture.doc.catalog.set(PDFName.of('Metadata'), ctx.register(ctx.stream(
      `<x:xmpmeta><rdf:Description xmpMM:History="h"><dc:title>Kept Title</dc:title>${XMP_THUMBS}</rdf:Description></x:xmpmeta>`,
      { Type: 'Metadata', Subtype: 'XML' },
    )));
    const out = await paths[path](await fixture.save());
    const reloaded = await PDFDocument.load(out, { updateMetadata: false });
    for (const [, o] of reloaded.context.enumerateIndirectObjects()) {
      const d = o instanceof PDFStream ? o.dict : o;
      if (d instanceof PDFDict) expect(d.has(PDFName.of('PieceInfo'))).toBe(false);
    }
    expect(reloaded.catalog.has(PDFName.of('PieceInfo'))).toBe(false);
    expect(readDocumentTraces(reloaded).pieceInfo).toBe(false);
    const xmp = reloaded.catalog.lookup(PDFName.of('Metadata'));
    expect(xmp).toBeInstanceOf(PDFStream);
    const text = Buffer.from(decodePDFRawStream(xmp).decode()).toString('utf8');
    expect(text).toContain('<dc:title>Kept Title</dc:title>');
    expect(text).toContain('xmpMM:History');
    expect(text).not.toContain('Thumbnails');
    expect(text).not.toContain('xmpGImg');
    expect(text).not.toContain('QUJDREVGRw');
  });

  it.each([['UTF-16BE', 'be'], ['UTF-16LE', 'le']])('strips the XMP thumbnails from a %s packet, re-encoded as UTF-8', async (_label, endian) => {
    const fixture = await buildTracesFixture();
    const ctx = fixture.doc.context;
    const packet = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta><rdf:Description xmpMM:History="h"><dc:title>Kept Title</dc:title>${XMP_THUMBS}</rdf:Description></x:xmpmeta><?xpacket end="w"?>`;
    const units = [0xFEFF, ...Array.from(packet, (c) => c.charCodeAt(0))];
    const raw = new Uint8Array(units.length * 2);
    units.forEach((u, i) => {
      raw[i * 2 + (endian === 'be' ? 0 : 1)] = u >> 8;
      raw[i * 2 + (endian === 'be' ? 1 : 0)] = u & 255;
    });
    fixture.doc.catalog.set(PDFName.of('Metadata'), ctx.register(ctx.stream(raw, { Type: 'Metadata', Subtype: 'XML' })));
    const out = await paths[path](await fixture.save());
    const reloaded = await PDFDocument.load(out, { updateMetadata: false });
    const xmp = reloaded.catalog.lookup(PDFName.of('Metadata'));
    const text = Buffer.from(decodePDFRawStream(xmp).decode()).toString('utf8');
    expect(text).toContain('<dc:title>Kept Title</dc:title>');
    expect(text).toContain('begin="\uFEFF"');
    expect(text).not.toContain('Thumbnails');
    expect(text).not.toContain('QUJDREVGRw');
  });

  it('the catalog /Metadata is an indirect stream', async () => {
    const out = await run();
    const reloaded = await PDFDocument.load(out, { updateMetadata: false });
    expect(reloaded.catalog.get(PDFName.of('Metadata'))).toBeInstanceOf(PDFRef);
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

  it('deleting created removes both dates', async () => {
    const t = await reread(await run({ details: { created: del } }));
    expect(t.creationDate).toBeNull();
    expect(t.modDate).toBeNull();
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

// A comment's file on a page that became a picture survives at document level.
describe('flattened path: a comment attachment on a covered page', () => {
  const coverPage1 = async (details) => {
    // The fixture's page 2 (index 1) carries the comment attachment; cover it.
    const source = await PDFDocument.load(await sourceBytes(), { updateMetadata: false });
    const out = await assemble(source, new Map([[1, { jpeg: JPEG, width: 300, height: 300 }]]), { details });
    return reread(new Uint8Array(out));
  };

  it('is listed at document level when untouched', async () => {
    const t = await coverPage1();
    const comment = t.attachments.filter((a) => a.name === 'comment.txt');
    expect(comment.length).toBeGreaterThan(0);
    expect(comment.some((a) => a.pageIndex === undefined)).toBe(true);
  });

  it('is absent once its id is deleted', async () => {
    const t = await coverPage1({ [attachmentDetailId({ name: 'comment.txt', pageIndex: 1 })]: del });
    expect(names(t)).not.toContain('comment.txt');
  });
});

// Nothing in the catalog may reach a page of the source: a covered page's text must not survive.
describe('flattened path: catalog actions never drag in a source page', () => {
  const SECRET = 'SECRET_PAGE_ONE_TEXT';
  const pageObjects = (doc) =>
    doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFDict && o.get(PDFName.of('Type')) === PDFName.of('Page'));
  const inflatedAll = (doc) =>
    doc.context.enumerateIndirectObjects()
      .filter(([, o]) => o instanceof PDFStream)
      .map(([, o]) => { try { return Buffer.from(decodePDFRawStream(o).decode()).toString('latin1'); } catch { return ''; } })
      .join('\n');

  async function build(mutate) {
    const doc = await PDFDocument.create({ updateMetadata: false });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const p1 = doc.addPage([300, 300]);
    p1.drawText(SECRET, { x: 20, y: 150, size: 12, font });
    const p2 = doc.addPage([300, 300]);
    mutate(doc, p1, p2);
    const source = await PDFDocument.load(new Uint8Array(await doc.save({ useObjectStreams: false })), { updateMetadata: false });
    const out = await assemble(source, new Map([[0, { jpeg: JPEG, width: 300, height: 300 }]]));
    const bytes = new Uint8Array(out);
    return { loaded: await PDFDocument.load(bytes, { updateMetadata: false }), bytes };
  }
  const expectClean = ({ loaded, bytes }) => {
    expect(pageObjects(loaded)).toHaveLength(2);
    expect(Buffer.from(bytes).toString('latin1')).not.toContain(SECRET);
    expect(inflatedAll(loaded)).not.toContain(SECRET);
  };
  const goTo = (ctx, page) => ctx.obj({ Type: 'Action', S: 'GoTo', D: [page.ref, 'Fit'] });
  const js = (ctx, m, next) => ctx.obj({ Type: 'Action', S: 'JavaScript', JS: PDFString.of(m), ...(next ? { Next: next } : {}) });

  it('an /OpenAction to a page and a catalog /AA GoTo reach no source page', async () => {
    const r = await build((doc, p1, p2) => {
      const ctx = doc.context;
      doc.catalog.set(PDFName.of('OpenAction'), ctx.obj([p1.ref, 'Fit']));
      doc.catalog.set(PDFName.of('AA'), ctx.obj({ WC: goTo(ctx, p2), WS: js(ctx, 'KEPT_AA') }));
    });
    expectClean(r);
    // the JavaScript entry of /AA is still there
    expect(readDocumentTraces(r.loaded).scripts.document).toBe(true);
  });

  it('a JavaScript /OpenAction whose /Next is a GoTo reaches no source page', async () => {
    const r = await build((doc, p1, p2) => {
      const ctx = doc.context;
      doc.catalog.set(PDFName.of('OpenAction'), js(ctx, 'OPEN', goTo(ctx, p1)));
      doc.catalog.set(PDFName.of('AA'), ctx.obj({ WC: js(ctx, 'AA', ctx.obj([goTo(ctx, p2)])) }));
    });
    expectClean(r);
  });

  it('a named script whose /Next is a GoTo reaches no source page; a plain one is kept', async () => {
    const r = await build((doc, p1) => {
      const ctx = doc.context;
      doc.catalog.set(PDFName.of('Names'), ctx.obj({
        JavaScript: { Names: [PDFString.of('Bad'), js(ctx, 'BAD', goTo(ctx, p1)), PDFString.of('Good'), js(ctx, 'GOOD')] },
      }));
    });
    expectClean(r);
    expect(readDocumentTraces(r.loaded).scripts.document).toBe(true);
  });

  const pageRefIn = (ctx, p1) => ctx.obj({ Page: p1.ref });
  const expectKept = (r, what) => {
    expectClean(r);
    expect(what(r.loaded)).toBe(true);
  };

  it('an Info value holding a page ref is skipped; the other keys stay', async () => {
    const r = await build((doc, p1) => {
      doc.getInfoDict().set(PDFName.of('Linked'), p1.ref);
      doc.setTitle('Kept');
    });
    expectKept(r, (d) => d.getTitle() === 'Kept' && !d.getInfoDict().has(PDFName.of('Linked')));
  });

  it('a /PieceInfo holding a page ref reaches no source page', async () => {
    const r = await build((doc, p1) => {
      doc.catalog.set(PDFName.of('PieceInfo'), doc.context.obj({ App: { Data: p1.ref } }));
    });
    expectClean(r);
  });

  it('a catalog /Metadata stream whose dict holds a page ref is skipped', async () => {
    const r = await build((doc, p1) => {
      const ctx = doc.context;
      doc.catalog.set(PDFName.of('Metadata'), ctx.register(ctx.stream('<x/>', { Type: 'Metadata', Subtype: 'XML', Extra: p1.ref })));
    });
    expectKept(r, (d) => !d.catalog.has(PDFName.of('Metadata')));
  });

  it('an /AF file spec with a page ref in its /EF params, or in /RF, is skipped; a plain one stays', async () => {
    const r = await build((doc, p1) => {
      const ctx = doc.context;
      const spec = (name, extra, params) => ctx.register(ctx.obj({
        Type: 'Filespec', F: PDFString.of(name), UF: PDFString.of(name), ...extra,
        EF: { F: ctx.register(ctx.stream('X', { Type: 'EmbeddedFile', Params: params ?? {} })) },
      }));
      doc.catalog.set(PDFName.of('AF'), ctx.obj([
        spec('viaparams.txt', {}, pageRefIn(ctx, p1)),
        spec('viarf.txt', { RF: { F: [PDFString.of('x'), p1.ref] } }),
        spec('plain.txt', {}),
      ]));
    });
    expectClean(r);
    expect(readDocumentTraces(r.loaded).attachments.map((a) => a.name)).toEqual(['plain.txt']);
  });

  it('a name-tree attachment whose spec reaches a page is skipped', async () => {
    const r = await build((doc, p1) => {
      const ctx = doc.context;
      const bad = ctx.register(ctx.obj({ Type: 'Filespec', F: PDFString.of('bad.txt'), Back: p1.ref }));
      doc.catalog.set(PDFName.of('Names'), ctx.obj({ EmbeddedFiles: { Names: [PDFString.of('bad.txt'), bad] } }));
    });
    expectClean(r);
    expect(readDocumentTraces(r.loaded).attachments).toEqual([]);
  });

  it('a FileAttachment comment without /FS on a covered page does not throw', async () => {
    const r = await build((doc, p1) => {
      const ctx = doc.context;
      p1.node.set(PDFName.of('Annots'), ctx.obj([ctx.register(ctx.obj({
        Type: 'Annot', Subtype: 'FileAttachment', Rect: [0, 0, 5, 5], P: p1.ref,
      }))]));
    });
    expectClean(r);
  });

  it('a plain JavaScript /OpenAction is kept', async () => {
    const r = await build((doc) => {
      doc.catalog.set(PDFName.of('OpenAction'), js(doc.context, 'OPEN'));
    });
    expectClean(r);
    expect(readDocumentTraces(r.loaded).scripts.document).toBe(true);
  });
});
