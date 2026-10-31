import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFStream, PDFString } from '@cantoo/pdf-lib';
import { serializeComment } from './commentPdf.ts';
import type { CommentElement } from '../model/editorModel.ts';
import type { SerializeContext } from './types.ts';

const base = { id: 'c', type: 'comment' as const, pageIndex: 0, left: 10, top: 10, width: 50, height: 10, comment: 'note text', commentedAt: Date.UTC(2026, 9, 31, 18, 5, 9) };
const passage: CommentElement = { ...base, anchor: { kind: 'passage', bands: [{ left: 0, top: 0, width: 100, height: 100 }] } };

async function run(element: CommentElement, extra: Partial<SerializeContext> = {}) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([200, 100]);
  serializeComment(element, { pdfDoc, page, pdfWidth: 200, pdfHeight: 100, pdfX: 20, pdfY: 90, loadCustomFont: async () => null, baselineOffset: () => 0, ...extra });
  const annots = page.node.Annots()?.asArray() ?? [];
  const dicts = annots.map((ref) => pdfDoc.context.lookup(ref) as PDFDict);
  const sub = (d: PDFDict) => d.get(PDFName.of('Subtype'))?.toString();
  const nums = (d: PDFDict, key: string) => (d.lookup(PDFName.of(key), PDFArray)).asArray().map((n) => (n as PDFNumber).asNumber());
  return { pdfDoc, annots, dicts, sub, nums };
}

describe('serializeComment', () => {
  it('writes a passage comment as its own /Highlight without the Print flag', async () => {
    const { dicts, sub, nums } = await run(passage);
    expect(dicts.map(sub)).toEqual(['/Highlight', '/Popup']);
    const h = dicts[0];
    expect(nums(h, 'QuadPoints')).toEqual([20, 90, 120, 90, 20, 80, 120, 80]);
    expect(h.has(PDFName.of('F'))).toBe(false);
    expect((h.lookup(PDFName.of('Contents')) as PDFHexString).decodeText()).toBe('note text');
    expect((h.lookup(PDFName.of('NM')) as PDFHexString).decodeText()).toBe('c');
    expect((h.lookup(PDFName.of('M')) as PDFString).asString()).toBe('D:20261031180509Z');
  });

  it('writes a passage comment with an empty /C (transparent) and an appearance that draws nothing', async () => {
    const { pdfDoc, dicts, nums } = await run(passage);
    const h = dicts[0];
    expect(nums(h, 'C')).toEqual([]);
    const ap = pdfDoc.context.lookup(h.lookup(PDFName.of('AP'), PDFDict).get(PDFName.of('N'))) as PDFStream;
    expect(nums(ap.dict, 'BBox')).toEqual(nums(h, 'Rect'));
    expect(ap.getContents().length).toBe(0);
    const popup = dicts[1];
    expect((popup.get(PDFName.of('F')) as PDFNumber).asNumber()).toBe(24);
  });

  it('writes a pin as an 18pt /Text note centered on the pin, no Print flag', async () => {
    const pin: CommentElement = { ...base, anchor: { kind: 'point' } };
    const { dicts, sub, nums } = await run(pin);
    expect(dicts.map(sub)).toEqual(['/Text']);
    const note = dicts[0];
    expect(note.get(PDFName.of('Name'))).toBe(PDFName.of('Comment'));
    expect(note.has(PDFName.of('F')) && ((note.get(PDFName.of('F')) as PDFNumber).asNumber() & 4)).toBeFalsy();
    expect((note.lookup(PDFName.of('Contents')) as PDFHexString).decodeText()).toBe('note text');
    expect((note.lookup(PDFName.of('NM')) as PDFHexString).decodeText()).toBe('c');
    expect(nums(note, 'Rect')).toEqual([61, 76, 79, 94]);
  });

  it('writes an element comment as a /Text note too, at the box top-right corner', async () => {
    const { dicts, sub, nums } = await run({ ...base, anchor: { kind: 'element', elementId: 'x' } });
    expect(dicts.map(sub)).toEqual(['/Text']);
    expect(nums(dicts[0], 'Rect')).toEqual([111, 81, 129, 99]);
  });

  it('keeps the note on the page when the box touches the right or bottom edge', async () => {
    const edge: CommentElement = { ...base, left: 95, top: 95, width: 5, height: 5, anchor: { kind: 'point' } };
    const { dicts, nums } = await run(edge, { pdfX: 190, pdfY: 5 });
    const [x0, y0, x1, y1] = nums(dicts[0], 'Rect');
    expect(x1).toBeLessThanOrEqual(200);
    expect(y0).toBeGreaterThanOrEqual(0);
    expect(x1 - x0).toBe(18);
    expect(y1 - y0).toBe(18);
  });

  it('writes nothing for a blank comment', async () => {
    const { annots } = await run({ ...passage, comment: '  ' });
    expect(annots).toHaveLength(0);
  });
});
