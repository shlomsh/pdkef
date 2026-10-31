import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream, degrees,
} from '@cantoo/pdf-lib';
import { mockFontFetch } from '#editor/adapters/pdf/fontFetch.test-helper.js';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { commentNumbers } from '../highlight/commentNumbers.ts';
import { pageGeometryFromPdfLibPage, signPdf } from '../sign.js';
import { planCommentsPages } from './commentsPages.ts';

let restoreFetch: () => void;
beforeEach(() => { restoreFetch = mockFontFetch(); });
afterEach(() => restoreFetch());

async function sourceBytes(pages = 3, rotate = 0) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([400, 500]);
    page.drawText(`Source passage ${i + 1}`, { x: 40, y: 400, size: 14, font });
    if (rotate) page.setRotation(degrees(rotate));
  }
  return doc.save();
}

function highlight(id: string, pageIndex: number, top: number, comment?: string, direction?: 'ltr' | 'rtl'): EditorElement {
  return {
    id, type: 'highlight', pageIndex, left: 10, top, width: 50, height: 3, color: '#ffe066',
    bands: [{ left: 0, top: 0, width: 100, height: 100 }], comment, direction,
  } as EditorElement;
}

const noFonts = async () => null;
const options = { title: 'Comments', entryLabel: 'Page {page}', loadCustomFont: noFonts, pageGeometry: pageGeometryFromPdfLibPage };

async function planOn(elements: EditorElement[], pages = 3) {
  const doc = await PDFDocument.load(await sourceBytes(pages));
  const plan = await planCommentsPages(doc, elements, commentNumbers(elements), options);
  return { doc, plan };
}

async function textOfLastPage(blob: Blob) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()), useWorkerFetch: false });
  const pdf = await task.promise;
  const page = await pdf.getPage(pdf.numPages);
  const content = await page.getTextContent();
  const pageCount = pdf.numPages;
  await task.destroy();
  return { text: content.items.map((item) => ('str' in item ? item.str : '')).join(' '), pageCount };
}

describe('planCommentsPages', () => {
  it('adds nothing when no highlight has a comment', async () => {
    const { doc, plan } = await planOn([highlight('a', 0, 10), highlight('b', 1, 10, '   ')]);
    expect(plan).toBeNull();
    expect(doc.getPageCount()).toBe(3);
  });

  it('appends one page the size of the last source page, with the title and entries as text elements', async () => {
    const elements = [highlight('late', 2, 10, 'second note'), highlight('early', 0, 10, 'first note')];
    const { doc, plan } = await planOn(elements);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getPage(3).getSize()).toEqual({ width: 400, height: 500 });
    const texts = plan!.elements.map((element) => (element as { text: string }).text);
    expect(texts[0]).toBe('Comments');
    // Number order, not array order: the page-1 highlight is comment 1.
    expect(texts.indexOf('Page 1')).toBeLessThan(texts.indexOf('Page 3'));
    expect(texts.join('|').indexOf('first note')).toBeLessThan(texts.join('|').indexOf('second note'));
    expect(plan!.elements.every((element) => element.type === 'text' && element.pageIndex === 3)).toBe(true);
  });

  it('lays out right to left when most comments are written in a right-to-left script, whatever the highlights recorded', async () => {
    const { plan } = await planOn([highlight('a', 0, 10, 'הערה ראשונה'), highlight('b', 0, 30, 'הערה שנייה', 'ltr')], 1);
    const title = plan!.elements[0] as { left: number };
    expect(title.left).toBeGreaterThan(50);
  });

  it('carries a Hebrew comment as a text element that reads right to left', async () => {
    const { plan } = await planOn([highlight('h', 0, 10, 'הערה חשובה מאוד', 'rtl')], 1);
    const hebrew = plan!.elements.find((element) => element.type === 'text' && element.text.includes('הערה'));
    expect(hebrew).toBeDefined();
    // A right-anchored line: its left is the column's right edge, past the page middle.
    expect((hebrew as { left: number }).left).toBeGreaterThan(50);
  });

  it('starts a second comments page when the entries do not fit on one', async () => {
    const elements = Array.from({ length: 14 }, (_, i) => highlight(`h${i}`, 0, 5 + i * 5, `note number ${i + 1}`));
    const { doc, plan } = await planOn(elements, 1);
    expect(doc.getPageCount()).toBeGreaterThan(2);
    const pageIndexes = new Set(plan!.elements.map((element) => element.pageIndex));
    expect(pageIndexes.size).toBe(doc.getPageCount() - 1);
  });
});

describe('signPdf comments page', () => {
  async function exported(elements: EditorElement[], pages = 3, rotate = 0) {
    const file = new File([await sourceBytes(pages, rotate)], 'paper.pdf', { type: 'application/pdf' });
    return signPdf(file, elements, undefined, { commentsPage: { title: 'Comments', entryLabel: 'Page {page}' } });
  }

  it('leaves the page count alone without comments', async () => {
    const blob = await exported([highlight('a', 0, 10)]);
    expect((await textOfLastPage(blob)).pageCount).toBe(3);
  });

  it('lists the comments in number order with their source pages', async () => {
    const blob = await exported([highlight('late', 2, 10, 'second note'), highlight('early', 0, 10, 'first note')]);
    const { text, pageCount } = await textOfLastPage(blob);
    expect(pageCount).toBe(4);
    expect(text).toContain('Comments');
    expect(text.indexOf('Page 1')).toBeGreaterThan(-1);
    expect(text.indexOf('Page 1')).toBeLessThan(text.indexOf('Page 3'));
    expect(text.indexOf('first note')).toBeLessThan(text.indexOf('second note'));
  });

  it('exports a Hebrew comment, with the Hebrew title when asked', async () => {
    const file = new File([await sourceBytes(1)], 'paper.pdf', { type: 'application/pdf' });
    const blob = await signPdf(file, [highlight('h', 0, 10, 'הערה חשובה', 'rtl')], undefined,
      { commentsPage: { title: 'הערות', entryLabel: 'עמוד {page}' } });
    const { text } = await textOfLastPage(blob);
    expect(text).toContain('עמוד');
    expect(text).toContain('הערות');
  });

  it('links each entry to the highlighted page', async () => {
    const blob = await exported([highlight('a', 2, 10, 'on three'), highlight('b', 0, 10, 'on one')]);
    const doc = await PDFDocument.load(await blob.arrayBuffer());
    const annots = doc.getPage(3).node.Annots() as PDFArray;
    const links = Array.from({ length: annots.size() }, (_, i) => annots.lookup(i, PDFDict))
      .filter((dict) => dict.get(PDFName.of('Subtype')) === PDFName.of('Link'));
    expect(links).toHaveLength(2);
    const targets = links.map((link) => (link.lookup(PDFName.of('Dest'), PDFArray)).get(0));
    expect(targets[0]).toBe(doc.getPage(0).ref);
    expect(targets[1]).toBe(doc.getPage(2).ref);
  });

  it('embeds the source page content in the clip, not an empty form', async () => {
    const blob = await exported([highlight('a', 0, 10, 'note')]);
    const doc = await PDFDocument.load(await blob.arrayBuffer());
    const forms = doc.context.enumerateIndirectObjects()
      .map(([, object]) => object)
      .filter((object): object is PDFRawStream => object instanceof PDFRawStream
        && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Form') && object.dict.has(PDFName.of('BBox')));
    expect(forms.length).toBeGreaterThan(0);
    const decoded = forms.map((form) => new TextDecoder('latin1').decode(decodePDFRawStream(form).decode()));
    expect(decoded.some((content) => content.includes('Tj') && content.includes('BT'))).toBe(true);
  });

  it('exports a clip of a rotated page', async () => {
    const blob = await exported([highlight('a', 1, 10, 'note')], 2, 90);
    expect((await textOfLastPage(blob)).pageCount).toBe(3);
  });
});
