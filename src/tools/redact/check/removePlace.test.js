import { describe, expect, it, beforeAll } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFStream, PDFString, StandardFonts } from '@cantoo/pdf-lib';
import { readSavedFile } from './readSavedFile.ts';
import { removePlace, PlaceNotFoundError } from './removePlace.ts';
import { locatePlaces } from './placeLocator.ts';
import { PDFJS_WASM_URL } from '../../../lib/pdfjsWasm.js';

beforeAll(() => {
  const workerUrl = pathToFileURL(path.resolve(process.cwd(), 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  Object.defineProperty(pdfjs.GlobalWorkerOptions, 'workerSrc', {
    get() { return workerUrl; },
    set() {},
    configurable: true,
  });
});

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const png = () => Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0));

const XMP = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">xmp-secret-title</rdf:li></rdf:Alt></dc:title></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

/** Outline: Alpha (child Alpha-1, which has child Alpha-1-a), Beta, Gamma. */
function addOutline(doc) {
  const ctx = doc.context;
  const page = doc.getPages()[0].node;
  const dest = () => ctx.obj([page, 'Fit']);
  const make = (title, extra = {}) => {
    const ref = ctx.nextRef();
    const dict = ctx.obj({ Title: PDFHexString.fromText(title), Dest: dest(), ...extra });
    ctx.assign(ref, dict);
    return { ref, dict };
  };
  const root = { ref: ctx.nextRef() };
  const alpha = make('Alpha');
  const alpha1 = make('Alpha-1');
  const alpha1a = make('Alpha-1-a');
  const beta = make('Beta');
  const gamma = make('Gamma');
  const link = (parent, kids) => {
    kids.forEach((kid, i) => {
      kid.dict.set(PDFName.of('Parent'), parent.ref);
      if (i > 0) kid.dict.set(PDFName.of('Prev'), kids[i - 1].ref);
      if (i < kids.length - 1) kid.dict.set(PDFName.of('Next'), kids[i + 1].ref);
    });
    parent.dict.set(PDFName.of('First'), kids[0].ref);
    parent.dict.set(PDFName.of('Last'), kids[kids.length - 1].ref);
  };
  root.dict = ctx.obj({ Type: 'Outlines' });
  ctx.assign(root.ref, root.dict);
  link(root, [alpha, beta, gamma]);
  link(alpha, [alpha1]);
  link(alpha1, [alpha1a]);
  alpha.dict.set(PDFName.of('Count'), ctx.obj(2));
  alpha1.dict.set(PDFName.of('Count'), ctx.obj(1));
  root.dict.set(PDFName.of('Count'), ctx.obj(5));
  doc.catalog.set(PDFName.of('Outlines'), root.ref);
  return { root, alpha, alpha1, alpha1a, beta, gamma };
}

async function buildFixture() {
  const doc = await PDFDocument.create();
  doc.setTitle('title-secret');
  doc.setAuthor('author-secret');
  doc.setSubject('subject-secret');
  doc.setKeywords(['keywords-secret']);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ctx = doc.context;

  const one = doc.addPage([400, 200]);
  one.drawText('Page one visible text 555-1234', { x: 20, y: 160, size: 12, font });
  const field = doc.getForm().createTextField('the.field');
  field.setText('field-secret-value');
  field.addToPage(one, { x: 20, y: 100, width: 150, height: 20, font });
  one.node.addAnnot(
    ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [20, 60, 170, 80], Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.com/link-secret') } })),
  );
  one.node.addAnnot(
    ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [300, 150, 320, 170], Contents: PDFString.of('comment-secret') })),
  );

  const two = doc.addPage([400, 200]);
  two.drawText('Page two visible text', { x: 20, y: 160, size: 12, font });
  two.node.addAnnot(
    ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [300, 150, 320, 170], Contents: PDFString.of('comment-two-secret') })),
  );

  addOutline(doc);

  ctx.assign(ctx.nextRef(), ctx.stream('')); // an unrelated object that must survive
  const xmpRef = ctx.register(ctx.stream(XMP, { Type: 'Metadata', Subtype: 'XML' }));
  doc.catalog.set(PDFName.of('Metadata'), xmpRef);

  await doc.attach(png(), 'attachment-one-secret.png', { mimeType: 'image/png' });
  await doc.attach(png(), 'attachment-two-secret.png', { mimeType: 'image/png' });
  return new Uint8Array(await doc.save({ updateFieldAppearances: true }));
}

async function read(bytes) {
  const loadingTask = pdfjs.getDocument({ data: bytes.slice(), wasmUrl: PDFJS_WASM_URL });
  const doc = await loadingTask.promise;
  try {
    return await readSavedFile(pdfjs, doc, { picturePages: [] });
  } finally {
    await loadingTask.destroy();
  }
}

const label = (p) => `${p.kind}|${p.pageIndex ?? ''}|${p.text}`;
const pageTexts = (saved) => saved.pages.map((p) => p.text.text);

/** Every string, name and stream body in every object the file holds, orphans
 * included, decoded; so "is it still in the file" does not depend on how the
 * bytes happen to be encoded or packed. */
async function everythingIn(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const parts = [];
  const walk = (obj) => {
    if (obj instanceof PDFString || obj instanceof PDFHexString) parts.push(obj.decodeText());
    else if (obj instanceof PDFName) parts.push(obj.decodeText());
    else if (obj instanceof PDFArray) obj.asArray().forEach(walk);
    else if (obj instanceof PDFStream) {
      walk(obj.dict);
      parts.push(Buffer.from(obj.getContents()).toString('latin1'));
    } else if (obj instanceof PDFDict) for (const [, value] of obj.entries()) walk(value);
  };
  for (const [, obj] of doc.context.enumerateIndirectObjects()) walk(obj);
  return parts.join('\n');
}
const contains = async (bytes, needle) => (await everythingIn(bytes)).includes(needle);

describe('removePlace', () => {
  it('lists the same places as readSavedFile (one locator, two readers)', async () => {
    const bytes = await buildFixture();
    const saved = await read(bytes);
    const located = locatePlaces(await PDFDocument.load(bytes, { updateMetadata: false }));
    // pdf.js lists form fields after the other annotations; the order is not part of the contract.
    const withoutXmp = (places) => places.filter((p) => p.kind !== 'metadata').map(label).sort();
    // A field's name is reported but not removable, so the locator has no entry for it.
    expect(withoutXmp(located.map((l) => l.place))).toEqual(withoutXmp(saved.places.filter((p) => p.removable !== false)));
    expect(located.some((l) => l.place.kind === 'metadata')).toBe(true);
    expect(saved.places.some((p) => p.kind === 'metadata')).toBe(true);
    // The fixture really covers every kind.
    const kinds = new Set(saved.places.map((p) => p.kind));
    for (const kind of ['field', 'comment', 'link', 'bookmark', 'title', 'author', 'subject', 'keywords', 'metadata', 'attachment']) {
      expect(kinds.has(kind)).toBe(true);
    }
  });

  it('removes exactly the one place asked for, leaving every other place and every page untouched', async () => {
    const bytes = await buildFixture();
    const before = await read(bytes);
    // XMP and a bookmark with children are their own tests below.
    const skip = (p) => p.kind === 'metadata' || ['Alpha', 'Alpha-1'].includes(p.text);
    for (const [index, place] of before.places.entries()) {
      if (skip(place) || place.removable === false) continue;
      const after = await read(await removePlace(bytes, place));
      const expected = before.places.filter((_, i) => i !== index).map(label);
      expect(after.places.map(label), `after removing ${label(place)}`).toEqual(expected);
      expect(pageTexts(after)).toEqual(pageTexts(before));
      expect(after.pages.length).toBe(before.pages.length);
    }
  });

  it.each(['title-secret', 'author-secret', 'subject-secret', 'keywords-secret'])(
    'takes %s out of the file bytes too',
    async (secret) => {
      const bytes = await buildFixture();
      const kind = secret.split('-')[0];
      const out = await removePlace(bytes, { kind, text: secret });
      expect(await contains(bytes, secret)).toBe(true);
      expect(await contains(out, secret)).toBe(false);
    },
  );

  it('removes XMP whole: the stream is gone from the bytes', async () => {
    const bytes = await buildFixture();
    expect(await contains(bytes, 'xmp-secret-title')).toBe(true);
    const out = await removePlace(bytes, { kind: 'metadata', text: 'xmp-secret-title' });
    expect(await contains(out, 'xmp-secret-title')).toBe(false);
    const after = await read(out);
    expect(after.places.some((p) => p.kind === 'metadata')).toBe(false);
    const before = await read(bytes);
    expect(after.places.map(label)).toEqual(before.places.filter((p) => p.kind !== 'metadata').map(label));
  });

  it('removes a bookmark with its children, relinking siblings and fixing the counts', async () => {
    const bytes = await buildFixture();
    const out = await removePlace(bytes, { kind: 'bookmark', text: 'Alpha' });
    const after = await read(out);
    expect(after.places.filter((p) => p.kind === 'bookmark').map((p) => p.text)).toEqual(['Beta', 'Gamma']);
    expect(await contains(out, 'Alpha')).toBe(false);

    const doc = await PDFDocument.load(out, { updateMetadata: false });
    const root = doc.context.lookup(doc.catalog.get(PDFName.of('Outlines')));
    expect(root.get(PDFName.of('Count')).asNumber()).toBe(2);
    const first = doc.context.lookup(root.get(PDFName.of('First')));
    expect(first.get(PDFName.of('Prev'))).toBeUndefined();
    const last = doc.context.lookup(root.get(PDFName.of('Last')));
    expect(last.get(PDFName.of('Next'))).toBeUndefined();
    expect(root.get(PDFName.of('First'))).not.toBe(root.get(PDFName.of('Last')));
  });

  it('removes a nested bookmark and the parent forgets it', async () => {
    const bytes = await buildFixture();
    const out = await removePlace(bytes, { kind: 'bookmark', text: 'Alpha-1' });
    const after = await read(out);
    expect(after.places.filter((p) => p.kind === 'bookmark').map((p) => p.text)).toEqual(['Alpha', 'Beta', 'Gamma']);
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    const root = doc.context.lookup(doc.catalog.get(PDFName.of('Outlines')));
    expect(root.get(PDFName.of('Count')).asNumber()).toBe(3);
    const alpha = doc.context.lookup(root.get(PDFName.of('First')));
    expect(alpha.get(PDFName.of('First'))).toBeUndefined();
    expect(alpha.get(PDFName.of('Last'))).toBeUndefined();
    expect(alpha.get(PDFName.of('Count'))).toBeUndefined();
  });

  it('removes the only bookmark, leaving an empty outline', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const ctx = doc.context;
    const rootRef = ctx.nextRef();
    const itemRef = ctx.nextRef();
    ctx.assign(itemRef, ctx.obj({ Title: PDFHexString.fromText('Only'), Parent: rootRef }));
    ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: itemRef, Last: itemRef, Count: 1 }));
    doc.catalog.set(PDFName.of('Outlines'), rootRef);
    const out = await removePlace(new Uint8Array(await doc.save()), { kind: 'bookmark', text: 'Only' });
    expect((await read(out)).places).toEqual([]);
  });

  it('removes one attachment from the name tree and its bytes; the other stays listed', async () => {
    const bytes = await buildFixture();
    const out = await removePlace(bytes, { kind: 'attachment', text: 'attachment-one-secret.png' });
    const after = await read(out);
    expect(after.places.filter((p) => p.kind === 'attachment').map((p) => p.text)).toEqual(['attachment-two-secret.png']);
    expect(after.attachmentCount).toBe(1);
    expect(await contains(out, 'attachment-one-secret')).toBe(false);
    expect(await contains(out, 'attachment-two-secret')).toBe(true);
    const last = await removePlace(out, { kind: 'attachment', text: 'attachment-two-secret.png' });
    const empty = await read(last);
    expect(empty.attachmentCount).toBe(0);
    expect(empty.places.some((p) => p.kind === 'attachment')).toBe(false);
  });

  it('clears a field value and the picture of it', async () => {
    const bytes = await buildFixture();
    expect(await contains(bytes, 'field-secret-value')).toBe(true);
    const out = await removePlace(bytes, { kind: 'field', text: 'field-secret-value', pageIndex: 0 });
    expect(await contains(out, 'field-secret-value')).toBe(false);
    const after = await read(out);
    expect(after.places.some((p) => p.kind === 'field' && p.removable !== false)).toBe(false);
    // The field itself is still there, just empty.
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getForm().getFields().map((f) => f.getName())).toEqual(['the.field']);
  });

  it('takes a comment and a link off their own page only', async () => {
    const bytes = await buildFixture();
    const out = await removePlace(bytes, { kind: 'comment', text: 'comment-two-secret', pageIndex: 1 });
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    expect(doc.getPages()[1].node.Annots()?.size() ?? 0).toBe(0);
    expect(doc.getPages()[0].node.Annots().size()).toBe(3);
    const noLink = await removePlace(bytes, { kind: 'link', text: 'https://example.com/link-secret', pageIndex: 0 });
    expect(await contains(noLink, 'link-secret')).toBe(false);
    expect(await contains(noLink, 'comment-secret')).toBe(true);
  });

  it('removes a note with its author and popup as one annotation', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const ctx = doc.context;
    const popupRef = ctx.nextRef();
    const noteRef = ctx.register(
      ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [10, 10, 30, 30], Contents: PDFString.of('note-body'), T: PDFString.of('note-author'), Popup: popupRef }),
    );
    ctx.assign(popupRef, ctx.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [50, 50, 150, 150], Parent: noteRef, Contents: PDFString.of('popup-body') }));
    page.node.addAnnot(noteRef);
    page.node.addAnnot(popupRef);
    const bytes = new Uint8Array(await doc.save());
    const before = await read(bytes);
    const target = before.places.find((p) => p.text === 'note-body');
    const out = await removePlace(bytes, target);
    expect(await contains(out, 'note-body')).toBe(false);
    expect(await contains(out, 'note-author')).toBe(false);
    expect(await contains(out, 'popup-body')).toBe(false);
    expect((await read(out)).places).toEqual([]);
  });

  it('adds nothing of its own: no producer, no dates, other form pictures kept', async () => {
    const bytes = await buildFixture();
    const out = await removePlace(bytes, { kind: 'author', text: 'author-secret' });
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    const info = doc.context.lookup(doc.context.trailerInfo.Info);
    const original = await PDFDocument.load(bytes, { updateMetadata: false });
    const originalInfo = original.context.lookup(original.context.trailerInfo.Info);
    const keys = (dict) => [...dict.keys()].map((k) => k.asString()).sort();
    expect(keys(info)).toEqual(keys(originalInfo).filter((k) => k !== '/Author'));
  });

  it('refuses, naming the place, when it is not in the file', async () => {
    const bytes = await buildFixture();
    await expect(removePlace(bytes, { kind: 'title', text: 'not there' })).rejects.toBeInstanceOf(PlaceNotFoundError);
    await expect(removePlace(bytes, { kind: 'comment', text: 'comment-secret', pageIndex: 1 })).rejects.toBeInstanceOf(PlaceNotFoundError);
  });

  it('removes the first of two identical places and leaves the second', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    for (const y of [10, 60]) {
      page.node.addAnnot(doc.context.register(doc.context.obj({
        Type: 'Annot', Subtype: 'Text', Rect: [10, y, 30, y + 20], Contents: PDFString.of('twin'),
      })));
    }
    const bytes = new Uint8Array(await doc.save());
    const out = await removePlace(bytes, { kind: 'comment', text: 'twin', pageIndex: 0 });
    expect((await read(out)).places.map(label)).toEqual(['comment|0|twin']);
  });
});
