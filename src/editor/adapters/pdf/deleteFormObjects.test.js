// RED-29: Delete reaches text and images drawn inside Form XObjects. A deletion
// carries the form path down from the page; the forms along it are copied for
// that page, the copy loses the span, and the replaced originals leave the file.
import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRef, PDFStream, decodePDFRawStream } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildDeletePreviewPage, deleteObjectsFromPdf } from './deleteObjects.js';
import { buildFormXObjectPdf } from './formXObjectFixture.test-helper.js';

const decoder = new TextDecoder();
const decodeStream = (stream) => decoder.decode(decodePDFRawStream(stream).decode());

/** The form ref tags down from a page: `names` are the XObject names drawn at each level. */
function formPathOf(doc, pageIndex, names) {
  const { context } = doc;
  let resources = doc.getPage(pageIndex).node.Resources();
  const path = [];
  for (const name of names) {
    const ref = context.lookup(resources.get(PDFName.of('XObject'))).get(PDFName.of(name));
    path.push(ref.tag);
    const form = context.lookup(ref);
    resources = context.lookup(form.dict.get(PDFName.of('Resources')));
  }
  return path;
}

/** A deletion for the whole `BT ... ET` line that shows `text`, inside the form at `names`. */
async function runDeletion(bytes, pageIndex, names, text, extra = {}) {
  const doc = await PDFDocument.load(bytes);
  const formPath = formPathOf(doc, pageIndex, names);
  const content = decodeStream(doc.context.lookup(PDFRef.of(...formPath.at(-1).split(' ').slice(0, 2).map(Number))));
  const at = content.indexOf(`(${text})`);
  const start = content.lastIndexOf('BT', at);
  const end = content.indexOf('ET', at) + 2;
  return { pageIndex, start, end, formPath, ...extra };
}

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

/** Every decoded stream in the file, so "gone" means gone from every object. */
async function allStreamText(bytes) {
  const doc = await PDFDocument.load(bytes);
  return [...doc.context.enumerateIndirectObjects()]
    .filter(([, o]) => o instanceof PDFStream)
    .map(([, o]) => {
      try {
        return decodeStream(o);
      } catch {
        return '';
      }
    });
}

const imageCount = async (bytes) => {
  const doc = await PDFDocument.load(bytes);
  return [...doc.context.enumerateIndirectObjects()].filter(
    ([, o]) => o instanceof PDFStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image',
  ).length;
};

const run = async (bytes, deletions) =>
  new Uint8Array(await (await deleteObjectsFromPdf(bytes, deletions)).arrayBuffer());

describe('deleting text inside a per-page Form XObject', () => {
  it('removes the run from page 0 and from every object, and leaves the other pages alone', async () => {
    const source = await buildFormXObjectPdf({ pages: 3 });
    const before = await pageTexts(source);
    const out = await run(source, [await runDeletion(source, 0, ['Xf1'], 'Secret 0')]);

    const after = await pageTexts(out);
    expect(after[0]).toContain('Keep 0');
    expect(after[0]).not.toContain('Secret 0');
    expect(after.slice(1)).toEqual(before.slice(1));
    expect((await allStreamText(out)).some((text) => text.includes('Secret 0'))).toBe(false);
  });
});

describe('deleting text inside a Form XObject shared by every page', () => {
  it('copies the form for the page, so the other pages keep the run', async () => {
    const source = await buildFormXObjectPdf({ pages: 3, shared: true });
    const out = await run(source, [await runDeletion(source, 0, ['Xf1'], 'Secret 0')]);

    const after = await pageTexts(out);
    expect(after[0]).toContain('Keep 0');
    expect(after[0]).not.toContain('Secret 0');
    expect(after[1]).toContain('Secret 0');
    expect(after[1]).toContain('Keep 0');
    expect(after[2]).toContain('Secret 0');

    const doc = await PDFDocument.load(out);
    const formOf = (i) => formPathOf(doc, i, ['Xf1'])[0];
    expect(formOf(0)).not.toBe(formOf(1));
    expect(formOf(1)).toBe(formOf(2));
  });

  it('deleting on two pages gives each its own copy and drops the orphaned original', async () => {
    const source = await buildFormXObjectPdf({ pages: 3, shared: true });
    const out = await run(source, [
      await runDeletion(source, 0, ['Xf1'], 'Secret 0'),
      await runDeletion(source, 1, ['Xf1'], 'Secret 0'),
      await runDeletion(source, 2, ['Xf1'], 'Secret 0'),
    ]);
    expect((await pageTexts(out)).join(' ')).not.toContain('Secret 0');
    expect((await allStreamText(out)).some((text) => text.includes('Secret 0'))).toBe(false);
  });
});

describe('deleting text inside a nested Form XObject', () => {
  it('removes the nested run, keeps the outer runs, and leaves no copy of it behind', async () => {
    const source = await buildFormXObjectPdf({ pages: 3, nested: true });
    const before = await pageTexts(source);
    expect(before[0]).toContain('Nested 0');
    const deletion = await runDeletion(source, 0, ['Xf1', 'Xin'], 'Nested 0');
    expect(deletion.formPath).toHaveLength(2);
    const out = await run(source, [deletion]);

    const after = await pageTexts(out);
    expect(after[0]).not.toContain('Nested 0');
    expect(after[0]).toContain('Secret 0');
    expect(after[0]).toContain('Keep 0');
    expect(after.slice(1)).toEqual(before.slice(1));
    expect((await allStreamText(out)).some((text) => text.includes('Nested 0'))).toBe(false);
  });

  it('two deletions that share the outer form edit one copy of it', async () => {
    const source = await buildFormXObjectPdf({ pages: 1, nested: true });
    const out = await run(source, [
      await runDeletion(source, 0, ['Xf1', 'Xin'], 'Nested 0'),
      await runDeletion(source, 0, ['Xf1'], 'Secret 0'),
    ]);
    const [text] = await pageTexts(out);
    expect(text).toContain('Keep 0');
    expect(text).not.toContain('Secret 0');
    expect(text).not.toContain('Nested 0');
  });
});

describe('deleting an image inside a Form XObject', () => {
  it('removes the image object once no page draws it any more', async () => {
    const source = await buildFormXObjectPdf({ pages: 3 });
    expect(await imageCount(source)).toBe(1);
    const deletions = [];
    for (let i = 0; i < 3; i += 1) {
      const doc = await PDFDocument.load(source);
      const formPath = formPathOf(doc, i, ['Xf1']);
      const content = decodeStream(doc.context.lookup(PDFRef.of(...formPath[0].split(' ').slice(0, 2).map(Number))));
      const start = content.indexOf('q 100 0 0 50');
      const end = content.indexOf('Do Q', start) + 4;
      const form = doc.context.lookup(doc.context.lookup(doc.getPage(i).node.Resources().get(PDFName.of('XObject'))).get(PDFName.of('Xf1')));
      const imageRef = doc.context.lookup(form.dict.get(PDFName.of('Resources'))).get(PDFName.of('XObject')).get(PDFName.of('Im1')).tag;
      deletions.push({ pageIndex: i, start, end, formPath, imageRef });
    }
    const out = await run(source, deletions);
    expect(await imageCount(out)).toBe(0);
    const after = await pageTexts(out);
    expect(after.map((t) => t.includes('Keep'))).toEqual([true, true, true]);
  });
});

describe('buildDeletePreviewPage with a form deletion', () => {
  it('renders the page without the run', async () => {
    for (const options of [{ pages: 3 }, { pages: 3, shared: true }]) {
      const source = await buildFormXObjectPdf(options);
      const sourceDoc = await PDFDocument.load(source);
      const deletion = await runDeletion(source, 0, ['Xf1'], 'Secret 0');
      const preview = await buildDeletePreviewPage(sourceDoc, 0, [deletion]);
      const [text] = await pageTexts(preview);
      expect(text).toContain('Keep 0');
      expect(text).not.toContain('Secret 0');
      expect((await allStreamText(preview)).some((t) => t.includes('Secret 0'))).toBe(false);
    }
  });

  it('renders a nested deletion without the nested run', async () => {
    const source = await buildFormXObjectPdf({ pages: 2, nested: true });
    const sourceDoc = await PDFDocument.load(source);
    const deletion = await runDeletion(source, 1, ['Xf1', 'Xin'], 'Nested 1');
    const [text] = await pageTexts(await buildDeletePreviewPage(sourceDoc, 1, [deletion]));
    expect(text).toContain('Secret 1');
    expect(text).not.toContain('Nested 1');
  });
});
