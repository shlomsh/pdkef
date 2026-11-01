import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFNumber, degrees } from '@cantoo/pdf-lib';
import { pageGeometryFromPdfLibPage, pageUserUnit } from './pdfLibGeometry.ts';

describe('pdf-lib page geometry', () => {
  it('reads the crop box and rotation', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 100]);
    page.setCropBox(10, 20, 100, 50);
    page.setRotation(degrees(90));
    const geometry = pageGeometryFromPdfLibPage(page);
    expect(geometry.width).toBe(50);
    expect(geometry.height).toBe(100);
  });

  it('defaults the user unit to 1 and reads a set one', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 100]);
    expect(pageUserUnit(page)).toBe(1);
    page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2));
    expect(pageUserUnit(page)).toBe(2);
  });
});
