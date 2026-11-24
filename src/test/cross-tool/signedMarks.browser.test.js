import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { signPdf } from '../../tools/sign/lib/sign.js';
import { extractPageObjects, getPageContentBytes } from '#editor/adapters/pdf/pdfObjects.js';
import { deleteObjectsFromPdf } from '../../tools/redact/lib/deleteObjects.js';

const decode = (bytes) => new TextDecoder().decode(bytes);

async function sourcePdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 500]);
  page.drawLine({ start: { x: 10, y: 10 }, end: { x: 390, y: 10 } });
  return new File([await doc.save()], 'src.pdf', { type: 'application/pdf' });
}

async function pageOf(blob) {
  return (await PDFDocument.load(await blob.arrayBuffer())).getPage(0);
}

// Every element Sign can export, one at a time: each is one Delete target, and
// deleting it gives back the page as it was before signing.
const EVERY_ELEMENT = [
  ['text', { id: 't', type: 'text', pageIndex: 0, left: 10, top: 10, text: 'Dana Levi', fontFamily: 'Arimo', fontSize: 12, color: '#000000' }],
  ['Hebrew text', { id: 'h', type: 'text', pageIndex: 0, left: 10, top: 30, text: 'דנה לוי 03/10/2026', fontFamily: 'Arimo', fontSize: 12, color: '#000000' }],
];

describe('every element Sign exports is one Delete target', () => {
  it.each(EVERY_ELEMENT)('%s', async (_, element) => {
    const source = await sourcePdf();
    const signed = await signPdf(source, [element]);
    const { objects } = extractPageObjects(await pageOf(signed), 0);
    expect(objects.map((o) => o.kind)).toEqual(['mark']);

    const [mark] = objects;
    const out = await deleteObjectsFromPdf(signed, [{ pageIndex: 0, start: mark.start, end: mark.end }]);
    const before = decode(getPageContentBytes(await pageOf(source)));
    const after = decode(getPageContentBytes(await pageOf(out)));
    expect(after.replace(/\s+/g, ' ')).not.toMatch(/PDkef|BT|Do\b/);
    expect(after).toContain(before.trim());
  });
});
