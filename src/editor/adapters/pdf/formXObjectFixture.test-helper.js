import { PDFDocument, PDFName, StandardFonts } from '@cantoo/pdf-lib';

// RED-29: a document shaped like the iTextSharp insurance policy that Delete
// could not touch. Every page's own content is only `q /Xf1 Do Q`; its text
// runs and its image are drawn inside a Form XObject. Built here rather than
// committed as a binary, like deleteObjects.test.js's own samples.
//
//   shared: one Form drawn by every page (a delete on one page must copy it)
//   nested: the page's Form also draws an inner Form holding one more run
//
// Each page i (0-based) draws "Secret i" and "Keep i" at known places, the
// image at 72,600 (100 x 50 pt), and with `nested`, "Nested i" at 72,500.
// With `shared`, every page draws the same Form, so its runs read "Secret 0".

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/**
 * @param {{ pages?: number, shared?: boolean, nested?: boolean }} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function buildFormXObjectPdf({ pages = 3, shared = false, nested = false } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const png = await doc.embedPng(Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0)));
  const { context } = doc;

  const innerForm = (i) => context.register(context.stream(
    `BT /F1 12 Tf 72 500 Td (Nested ${i}) Tj ET`,
    { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 612, 792], Resources: { Font: { F1: font.ref } } },
  ));

  const pageForm = (i) => {
    const inner = nested ? innerForm(i) : null;
    const content = [
      `BT /F1 12 Tf 72 700 Td (Secret ${i}) Tj ET`,
      `BT /F1 12 Tf 72 680 Td (Keep ${i}) Tj ET`,
      'q 100 0 0 50 72 600 cm /Im1 Do Q',
      ...(inner ? ['/Xin Do'] : []),
    ].join('\n');
    return context.register(context.stream(content, {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 612, 792],
      Resources: { Font: { F1: font.ref }, XObject: { Im1: png.ref, ...(inner ? { Xin: inner } : {}) } },
    }));
  };

  const sharedForm = shared ? pageForm(0) : null;
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([612, 792]);
    page.node.set(PDFName.of('Resources'), context.obj({ XObject: { Xf1: sharedForm ?? pageForm(i) } }));
    page.node.set(PDFName.of('Contents'), context.register(context.stream('q /Xf1 Do Q')));
  }
  return doc.save({ useObjectStreams: false });
}
