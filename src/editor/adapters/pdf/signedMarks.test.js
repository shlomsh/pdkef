import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { signPdf } from './sign.js';
import { extractPageObjects, getPageContentBytes } from './pdfObjects.js';
import { deleteObjectsFromPdf } from './deleteObjects.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
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

const tick = { id: 's', type: 'symbol', pageIndex: 0, left: 20, top: 20, width: 8, height: 8, mark: 'check', color: '#1463ff' };
const signature = { id: 'g', type: 'signature', pageIndex: 0, left: 40, top: 40, width: 20, height: 8, dataUrl: PNG };

describe('what Sign bakes is one mark each (RED-55)', () => {
  it('reports a check symbol as exactly one mark covering the tick', async () => {
    const { objects } = extractPageObjects(await pageOf(await signPdf(await sourcePdf(), [tick])), 0);
    expect(objects.map((o) => o.kind)).toEqual(['mark']);
    // 8% of 400pt wide, left at 20%: the tick's ink lies inside that box, top 20% of 500pt down.
    const { bbox } = objects[0];
    expect(bbox.x).toBeGreaterThanOrEqual(80 - 1);
    expect(bbox.x + bbox.width).toBeLessThanOrEqual(80 + 32 + 1);
    expect(bbox.y + bbox.height).toBeLessThanOrEqual(500 - 100 + 1);
    expect(bbox.width).toBeGreaterThan(10);
    expect(bbox.height).toBeGreaterThan(5);
  });

  it('gives a symbol and a signature one mark each and no separate image unit', async () => {
    const { objects } = extractPageObjects(await pageOf(await signPdf(await sourcePdf(), [tick, signature])), 0);
    expect(objects.map((o) => o.kind)).toEqual(['mark', 'mark']);
  });

  it('deleting the tick mark removes its path operators and keeps the page content', async () => {
    const signed = await signPdf(await sourcePdf(), [tick]);
    const page = await pageOf(signed);
    const original = decode(getPageContentBytes((await PDFDocument.load(await (await sourcePdf()).arrayBuffer())).getPage(0)));
    const { objects } = extractPageObjects(page, 0);
    const [mark] = objects;
    const out = await deleteObjectsFromPdf(signed, [{ pageIndex: 0, start: mark.start, end: mark.end }]);
    const content = decode(getPageContentBytes(await pageOf(out)));
    expect(content).toContain(original.trim());
    expect(content).not.toMatch(/\bPDkef\b/);
    // Only the source's own line remains: one stroke, one move, one line-to.
    expect(content.match(/\bl\b/g)).toHaveLength(original.match(/\bl\b/g).length);
    expect(content.match(/\bS\b/g)).toHaveLength(original.match(/\bS\b/g).length);
  });

  it('drops an image only a deleted mark drew', async () => {
    const signed = await signPdf(await sourcePdf(), [signature]);
    const page = await pageOf(signed);
    const [mark] = extractPageObjects(page, 0).objects;
    const out = await deleteObjectsFromPdf(signed, [{ pageIndex: 0, start: mark.start, end: mark.end }]);
    const reloaded = await PDFDocument.load(await out.arrayBuffer());
    const images = reloaded.context.enumerateIndirectObjects().filter(([, o]) =>
      o.dict?.get(PDFName.of('Subtype'))?.asString?.() === '/Image');
    expect(images).toHaveLength(0);
  });
});
