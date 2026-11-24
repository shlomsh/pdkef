import { PDFDocument } from '@cantoo/pdf-lib';

/**
 * A real PDF with one page per entry of `widths`: each page's MediaBox is that wide and
 * `300 + 10 * index` high, so a merged output read back with pdf-lib says which page came from where
 * (the width names the file, the height the page's place in it).
 */
export async function pagesPdf(widths: number[], name: string): Promise<File> {
  const doc = await PDFDocument.create();
  widths.forEach((width, index) => { doc.addPage([width, 300 + 10 * index]); });
  return new File([await doc.save()], name, { type: 'application/pdf' });
}
