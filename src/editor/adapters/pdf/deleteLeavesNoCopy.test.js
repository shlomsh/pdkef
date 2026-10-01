// RED-48: a Delete-only save carries no copy of what was deleted. The rewrite
// gives a page a new content stream; the old one must leave the file too,
// because pdf-lib saves every object still registered in the document.
import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRef, PDFStream, StandardFonts, decodePDFRawStream } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { deleteObjectsFromPdf, listDeletableObjects } from './deleteObjects.js';
import { buildFormXObjectPdf } from './formXObjectFixture.test-helper.js';

const decoder = new TextDecoder();
const toHex = (text) => [...text].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');

/** Every decoded stream of the saved file, so "gone" means gone from every object. */
async function allStreamText(bytes) {
  const doc = await PDFDocument.load(bytes);
  return [...doc.context.enumerateIndirectObjects()]
    .filter(([, o]) => o instanceof PDFStream)
    .map(([, o]) => {
      try {
        return decoder.decode(decodePDFRawStream(o).decode());
      } catch {
        return '';
      }
    });
}

/** True when `text` appears literally or as the hex string drawText writes. */
const hasCopy = async (bytes, text) =>
  (await allStreamText(bytes)).some((s) => s.includes(text) || s.toLowerCase().includes(toHex(text)));

async function pageTexts(bytes) {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes).slice(), useSystemFonts: true });
  const pdf = await task.promise;
  const texts = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const content = await (await pdf.getPage(n)).getTextContent();
    texts.push(content.items.map((item) => item.str).join(' '));
  }
  await task.destroy();
  return texts;
}

const run = async (bytes, deletions) =>
  new Uint8Array(await (await deleteObjectsFromPdf(bytes, deletions)).arrayBuffer());

/** Pages whose /Contents are the given streams (a ref to one, or an array of several). */
async function buildPdf(pageContents) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { context } = doc;
  for (const contents of pageContents) {
    const page = doc.addPage([612, 792]);
    page.node.set(PDFName.of('Resources'), context.obj({ Font: { F1: font.ref } }));
    page.node.set(PDFName.of('Contents'), contents(context));
  }
  return doc.save({ useObjectStreams: false });
}

const stream = (context, text) => context.register(context.stream(text));
const line = (y, text) => `BT /F1 12 Tf 72 ${y} Td (${text}) Tj ET`;

/** The listed object whose rendered text is `text`. */
async function objectShowing(bytes, text, pageIndex = 0) {
  const objects = await listDeletableObjects(bytes);
  const found = objects.find((o) => o.pageIndex === pageIndex && o.preview?.includes(text));
  if (found) return found;
  throw new Error(`no deletable object shows ${text}: ${JSON.stringify(objects.map((o) => o.preview))}`);
}

describe('a page-level delete leaves no copy', () => {
  it('drops the old content stream of a drawText page', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.drawText('TopSecretWord', { x: 72, y: 700, size: 12, font });
    page.drawText('KeepWord', { x: 72, y: 680, size: 12, font });
    const source = await doc.save({ useObjectStreams: false });
    expect(await hasCopy(source, 'TopSecretWord')).toBe(true);

    const target = await objectShowing(source, 'TopSecretWord');
    const out = await run(source, [target]);
    expect(await hasCopy(out, 'TopSecret')).toBe(false);
    expect((await pageTexts(out))[0]).toContain('KeepWord');
    expect((await pageTexts(out))[0]).not.toContain('TopSecret');
  });

  it('drops every stream of a /Contents array', async () => {
    const source = await buildPdf([
      (c) => c.obj([stream(c, line(700, 'FirstKeep')), stream(c, `${line(680, 'SecondSecret')}\n${line(660, 'SecondKeep')}`)]),
    ]);
    const out = await run(source, [await objectShowing(source, 'SecondSecret')]);
    expect(await hasCopy(out, 'SecondSecret')).toBe(false);
    const text = (await pageTexts(out))[0];
    expect(text).toContain('FirstKeep');
    expect(text).toContain('SecondKeep');
  });

  it('drops the old stream when /Contents is a ref to an array', async () => {
    const source = await buildPdf([(c) => c.register(c.obj([stream(c, line(700, 'ViaArraySecret')), stream(c, line(680, 'ViaArrayKeep'))]))]);
    const out = await run(source, [await objectShowing(source, 'ViaArraySecret')]);
    expect(await hasCopy(out, 'ViaArraySecret')).toBe(false);
    expect((await pageTexts(out))[0]).toContain('ViaArrayKeep');
  });

  it('keeps a content stream another page still references', async () => {
    let shared;
    const source = await buildPdf([
      (c) => (shared = stream(c, `${line(700, 'SharedSecret')}\n${line(680, 'SharedKeep')}`)),
      () => shared,
    ]);
    const out = await run(source, [await objectShowing(source, 'SharedSecret')]);

    const texts = await pageTexts(out);
    expect(texts[0]).not.toContain('SharedSecret');
    expect(texts[0]).toContain('SharedKeep');
    expect(texts[1]).toContain('SharedSecret');
    expect(texts[1]).toContain('SharedKeep');
  });
});

describe('a form-level delete leaves no copy', () => {
  async function formDeletion(bytes, pageIndex, names, text) {
    const doc = await PDFDocument.load(bytes);
    const { context } = doc;
    let resources = doc.getPage(pageIndex).node.Resources();
    const formPath = [];
    let content = '';
    for (const name of names) {
      const ref = context.lookup(resources.get(PDFName.of('XObject'))).get(PDFName.of(name));
      formPath.push(ref.tag);
      const form = context.lookup(ref);
      content = decoder.decode(decodePDFRawStream(form).decode());
      resources = context.lookup(form.dict.get(PDFName.of('Resources')));
    }
    const at = content.indexOf(`(${text})`);
    return { pageIndex, start: content.lastIndexOf('BT', at), end: content.indexOf('ET', at) + 2, formPath };
  }

  it('per-page and nested forms', async () => {
    const source = await buildFormXObjectPdf({ pages: 2, nested: true });
    const out = await run(source, [
      await formDeletion(source, 0, ['Xf1'], 'Secret 0'),
      await formDeletion(source, 0, ['Xf1', 'Xin'], 'Nested 0'),
    ]);
    expect(await hasCopy(out, 'Secret 0')).toBe(false);
    expect(await hasCopy(out, 'Nested 0')).toBe(false);
    const texts = await pageTexts(out);
    expect(texts[0]).toContain('Keep 0');
    expect(texts[1]).toContain('Secret 1');
  });
});
