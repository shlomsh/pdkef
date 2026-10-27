// One PDF fixture builder for the e2e specs (ARCH-77). Every spec used to carry
// its own makePdfBuffer; each variant is expressible through `opts`.
import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

/**
 * @param {string | null | undefined} label  Document title when `title` is on.
 * @param {object} [opts]
 * @param {number} [opts.pages=1]       Page count.
 * @param {[number, number]} [opts.size=[612, 792]]  Page size in points.
 * @param {boolean} [opts.title=true]   Set the PDF title metadata to `label`.
 * @param {Array | ((pageIndex: number, pageCount: number) => Array)} [opts.lines]
 *   Text drawn on every page (Helvetica). A line is
 *   `{ text, x = 72, y = 720, size = 18, gray = 0.1 }`; `gray: null` draws in
 *   the font's default colour. No lines means no font is embedded.
 * @returns {Promise<Buffer>}
 */
export async function makePdfBuffer(label, { pages = 1, size = [612, 792], title = true, lines = [] } = {}) {
  const document = await PDFDocument.create();
  const linesFor = typeof lines === 'function' ? lines : () => lines;
  const font = (typeof lines === 'function' || lines.length > 0) ? await document.embedFont(StandardFonts.Helvetica) : null;
  for (let i = 0; i < pages; i += 1) {
    const page = document.addPage(size);
    for (const { text, x = 72, y = 720, size: fontSize = 18, gray = 0.1 } of linesFor(i, pages)) {
      const options = { x, y, size: fontSize, font };
      if (gray !== null) options.color = rgb(gray, gray, gray);
      page.drawText(text, options);
    }
  }
  if (title) document.setTitle(label);
  return Buffer.from(await document.save());
}
