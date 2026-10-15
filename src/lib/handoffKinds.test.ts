import { describe, expect, it } from 'vitest';
import { handoffFitsPage, handoffKindsForPage } from './handoffKinds.ts';

const pdfRecord = { fileName: 'דוח.pdf', fileType: 'application/pdf', fileBytes: new ArrayBuffer(1) };
const photoRecord = { fileName: 'me.jpg', fileType: 'image/jpeg', fileBytes: new ArrayBuffer(1) };

describe('handoffKindsForPage', () => {
  it.each([
    ['compress', '/compress-image/', ['image']],
    ['compress', '/he/compress-image/', ['image']],
    ['compress', '/compress/', ['pdf']],
    ['compress', '/he/compress/', ['pdf']],
  ])('%s on %s takes %j', (tool, pathname, kinds) => {
    expect(handoffKindsForPage(tool, pathname)).toEqual(kinds);
  });

  it('puts no restriction on a tool that takes whatever it is handed', () => {
    expect(handoffKindsForPage('sign', '/sign/')).toBeNull();
    expect(handoffKindsForPage('merge', '/merge/')).toBeNull();
  });
});

describe('handoffFitsPage', () => {
  it('keeps a PDF out of the image page and a photo out of the PDF page', () => {
    expect(handoffFitsPage(pdfRecord, ['image'])).toBe(false);
    expect(handoffFitsPage(photoRecord, ['pdf'])).toBe(false);
  });

  it('accepts a record of the page kind, a multi record only when every file fits', () => {
    expect(handoffFitsPage(photoRecord, ['image'])).toBe(true);
    expect(handoffFitsPage(pdfRecord, ['pdf'])).toBe(true);
    expect(handoffFitsPage({ files: [pdfRecord, photoRecord] }, ['pdf'])).toBe(false);
  });

  it('reads a record with no type as a PDF, exactly as filesFromHandoff builds its File', () => {
    expect(handoffFitsPage({ fileName: 'a.png', fileBytes: new ArrayBuffer(1) }, ['image'])).toBe(false);
    expect(handoffFitsPage({ fileName: 'a', fileBytes: new ArrayBuffer(1) }, ['pdf'])).toBe(true);
  });

  it('accepts anything when the page has no restriction', () => {
    expect(handoffFitsPage(pdfRecord, null)).toBe(true);
  });
});
