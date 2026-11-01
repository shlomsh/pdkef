import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from '@cantoo/pdf-lib';

/** The yellow in Sign's highlight palette (src/editor/model/highlightColors.ts), as 0..1 channels for /C. */
export const YELLOW = [1, 243 / 255, 77 / 255];

const toPdfDate = (ms) => `D:${new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;

/**
 * A one-page Helvetica text PDF carrying standard `/Highlight` annotations (ISO 32000 12.5.6), the shape
 * any other viewer writes. Pure pdf-lib, no tool imports. Returns bytes.
 *
 * @param {object} [opts]
 * @param {number[]} [opts.size] page size in points, default Letter
 * @param {{ text: string, x?: number, y?: number, size?: number }[]} opts.lines text drawn in Helvetica
 * @param {{ line: string, color?: number[], contents?: string, modified?: number, popup?: boolean }[]} opts.highlights
 *   `line` names the line of text to cover with /QuadPoints; `color` is /C (default YELLOW), /CA is 1;
 *   `contents` adds /Contents (and /M from `modified`); `popup` adds a closed /Popup.
 * @returns {Promise<Buffer>}
 */
export async function buildHighlightedPdf({ size = [612, 792], lines, highlights }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(size);
  const placed = new Map();
  for (const { text, x = 72, y = 720, size: fontSize = 18 } of lines) {
    page.drawText(text, { x, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
    placed.set(text, { x, y, fontSize, width: font.widthOfTextAtSize(text, fontSize) });
  }
  const annots = [];
  for (const { line, color = YELLOW, contents, modified, popup = false } of highlights) {
    const at = placed.get(line);
    if (!at) throw new Error(`highlight names a line that is not on the page: ${line}`);
    const left = at.x;
    const right = at.x + at.width;
    const bottom = at.y - at.fontSize * 0.2;
    const top = at.y + at.fontSize * 0.8;
    const fields = {
      Type: 'Annot', Subtype: 'Highlight', Rect: [left, bottom, right, top],
      QuadPoints: [left, top, right, top, left, bottom, right, bottom],
      C: color, CA: 1, F: 4,
    };
    const annot = doc.context.obj(fields);
    if (contents !== undefined) {
      annot.set(PDFName.of('Contents'), PDFString.of(contents));
      if (modified !== undefined) annot.set(PDFName.of('M'), PDFString.of(toPdfDate(modified)));
    }
    const ref = doc.context.register(annot);
    if (popup) {
      const popupRef = doc.context.register(doc.context.obj({
        Type: 'Annot', Subtype: 'Popup', Rect: [right + 10, bottom - 100, right + 210, top], Parent: ref, Open: false, F: 24,
      }));
      annot.set(PDFName.of('Popup'), popupRef);
      annots.push(ref, popupRef);
    } else {
      annots.push(ref);
    }
  }
  page.node.set(PDFName.of('Annots'), doc.context.obj(annots));
  return Buffer.from(await doc.save());
}
