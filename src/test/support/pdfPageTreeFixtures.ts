/**
 * Raw-byte PDFs whose catalog lost its page list (DEBT-54), for the tests of
 * pdfPageTree and loadPdfPages (src/lib). Hand-built rather than saved by pdf-lib, because
 * pdf-lib would write a healthy file. Pages are told apart by MediaBox width.
 */

type Obj = string;

/** Latin-1 bytes: every character here is ASCII, and Node's Buffer is not in the browser types. */
const latin1 = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

/** Classic xref table file, every object written inline. */
export function buildPdf(objs: Record<number, Obj>): Uint8Array {
  let text = '%PDF-1.5\n';
  const offs: Record<number, number> = {};
  const nums = Object.keys(objs).map(Number).sort((a, b) => a - b);
  for (const n of nums) {
    offs[n] = text.length;
    text += `${n} 0 obj\n${objs[n]}\nendobj\n`;
  }
  const size = Math.max(...nums) + 1;
  let x = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i++) {
    x += offs[i] !== undefined ? `${String(offs[i]).padStart(10, '0')} 00000 n \n` : '0000000000 00000 f \n';
  }
  x += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${text.length}\n%%EOF\n`;
  return latin1(text + x);
}

const pg = (w: number, parent: number) => `<< /Type /Page /Parent ${parent} 0 R /MediaBox [0 0 ${w} 500] >>`;
const base = (over: Record<number, Obj> = {}): Record<number, Obj> => ({
  1: '<< /Type /Catalog /Pages 2 0 R >>',
  2: '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>',
  3: pg(200, 2),
  4: pg(300, 2),
  5: pg(400, 2),
  ...over,
});

export const ORIGINAL_WIDTHS = [200, 300, 400];

export const healthy = () => buildPdf(base());
/** Catalog without /Pages. */
export const noPagesKey = () => buildPdf(base({ 1: '<< /Type /Catalog >>' }));
/** /Pages points at an object that does not exist. */
export const pagesRefMissing = () => buildPdf(base({ 1: '<< /Type /Catalog /Pages 99 0 R >>' }));
/** /Pages points at a number. */
export const pagesWrongType = () => buildPdf(base({ 1: '<< /Type /Catalog /Pages 6 0 R >>', 6: '42' }));
/** Root survives under a nested node; the pages inherit MediaBox and Rotate from it. */
export const inheritedBox = () =>
  buildPdf({
    1: '<< /Type /Catalog /Pages 99 0 R >>',
    2: '<< /Type /Pages /Kids [6 0 R 5 0 R] /Count 3 >>',
    6: '<< /Type /Pages /Parent 2 0 R /Kids [3 0 R 4 0 R] /Count 2 /MediaBox [0 0 250 500] /Rotate 90 >>',
    3: '<< /Type /Page /Parent 6 0 R >>',
    4: pg(300, 6),
    5: pg(400, 2),
  });
/** Two parentless page-tree roots: we cannot tell which one is the document's. */
export const twoRoots = () =>
  buildPdf(
    base({
      1: '<< /Type /Catalog /Pages 99 0 R >>',
      6: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    }),
  );
/** The page tree object is gone (e.g. its object stream was unreadable): only loose /Page objects remain. */
export const noRoot = () => {
  const o = base({ 1: '<< /Type /Catalog /Pages 2 0 R >>' });
  delete o[2];
  return buildPdf(o);
};

