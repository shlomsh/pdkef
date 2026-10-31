import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { signPdf } from './sign.js';
import { mockFontFetch } from '#editor/adapters/pdf/fontFetch.test-helper.js';

const subtypes = (pdfDoc) => {
  const annots = pdfDoc.getPage(0).node.Annots();
  return Array.from({ length: annots?.size() ?? 0 }, (_, i) => pdfDoc.context.lookup(annots.get(i)).get(PDFName.of('Subtype')).toString());
};

describe('a PDF exported with highlight comments, exported again', () => {
  let restoreFetch;
  beforeEach(() => { restoreFetch = mockFontFetch(); });
  afterEach(() => { restoreFetch(); vi.restoreAllMocks(); });

  it('keeps every annotation, then flattens without throwing and leaves no orphan popup', async () => {
    const source = await PDFDocument.create();
    source.addPage([400, 500]);
    const file = new File([await source.save()], 'paper.pdf', { type: 'application/pdf' });
    const highlight = { id: 'h-1', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 50, height: 5, color: '#FFF34D', direction: 'rtl', bands: [{ left: 0, top: 0, width: 100, height: 100 }] };
    const comment = { id: 'c-1', type: 'comment', pageIndex: 0, left: 10, top: 20, width: 50, height: 5, comment: 'שלום', commentedAt: 1, anchor: { kind: 'element', elementId: 'h-1' } };

    const first = await signPdf(file, [highlight, comment]);
    const firstDoc = await PDFDocument.load(await first.arrayBuffer());
    expect(subtypes(firstDoc).sort()).toEqual(['/Highlight', '/Popup']);

    const second = await signPdf(new File([first], 'again.pdf', { type: 'application/pdf' }), []);
    const secondDoc = await PDFDocument.load(await second.arrayBuffer());
    expect(subtypes(secondDoc)).not.toContain('/Popup');
  });

  it('writes a comment anchored to a highlight into that highlight, and a pin as its own sticky note', async () => {
    const source = await PDFDocument.create();
    source.addPage([400, 500]);
    const file = new File([await source.save()], 'paper.pdf', { type: 'application/pdf' });
    const highlight = { id: 'h-1', type: 'highlight', pageIndex: 0, left: 10, top: 20, width: 50, height: 5, color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }] };
    const base = { type: 'comment', pageIndex: 0, commentedAt: 1 };
    const onHighlight = { ...base, id: 'c-1', left: 0, top: 0, width: 0, height: 0, comment: 'one', anchor: { kind: 'element', elementId: 'h-1' } };
    const pin = { ...base, id: 'c-2', left: 60, top: 60, width: 2, height: 2, comment: 'two', anchor: { kind: 'point' } };
    const doc = await PDFDocument.load(await (await signPdf(file, [pin, highlight, onHighlight])).arrayBuffer());
    // The page-0 annots: one highlight with its popup, one note; nothing for the anchored comment itself.
    expect(subtypes(doc).sort()).toEqual(['/Highlight', '/Popup', '/Text']);
  });
});
