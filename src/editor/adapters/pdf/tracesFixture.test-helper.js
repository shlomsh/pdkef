import {
  PDFDocument, PDFName, PDFString, PDFHexString,
  drawObject, pushGraphicsState, popGraphicsState, concatTransformationMatrix,
} from '@cantoo/pdf-lib';

const N = PDFName.of;

/** A two-page document carrying every kind of trace RED-59 strips (page 2 holds most). */
export const SOURCE_ID_HEX = '00112233445566778899AABBCCDDEEFF';

/**
 * Builds the fixture with the pdf-lib low-level API. Returns the live document
 * and a `save` that writes it with its fixed source file ID.
 */
export async function buildTracesFixture() {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const ctx = doc.context;
  const p1 = doc.addPage([300, 300]);
  const p2 = doc.addPage([300, 300]);

  const xmp = (m) => ctx.register(ctx.stream(
    `<?xpacket begin=""?><x:xmpmeta><!-- ${m} xmpMM:History --></x:xmpmeta><?xpacket end="w"?>`,
    { Type: 'Metadata', Subtype: 'XML' },
  ));
  const js = (m) => ctx.obj({ Type: 'Action', S: 'JavaScript', JS: PDFString.of(m) });
  const piece = (m) => ctx.obj({ App: { LastModified: PDFString.of(m) } });
  const attachment = (name, payload) => ctx.register(ctx.obj({
    Type: 'Filespec', F: PDFString.of(name), UF: PDFString.of(name),
    EF: { F: ctx.register(ctx.stream(payload, { Type: 'EmbeddedFile' })) },
  }));

  // Page 1: thumbnail and page script.
  p1.node.set(N('Thumb'), ctx.register(ctx.stream(new Uint8Array(16), {
    Type: 'XObject', Subtype: 'Image', Width: 4, Height: 4, ColorSpace: 'DeviceGray', BitsPerComponent: 8,
  })));
  p1.node.set(N('AA'), ctx.obj({ O: js('PAGE_SCRIPT') }));

  // Page 2: attachment comment, a Text comment, page and object details.
  const fileAnnot = ctx.register(ctx.obj({
    Type: 'Annot', Subtype: 'FileAttachment', Rect: [10, 10, 30, 30], Name: 'PushPin',
    FS: attachment('comment.txt', 'COMMENT_ATTACHMENT'), F: 4,
  }));
  const textAnnot = ctx.register(ctx.obj({
    Type: 'Annot', Subtype: 'Text', Rect: [50, 50, 70, 70], Contents: PDFString.of('A COMMENT'),
  }));
  p2.node.set(N('Annots'), ctx.obj([fileAnnot, textAnnot]));
  p2.node.set(N('Metadata'), xmp('PAGE'));
  p2.node.set(N('PieceInfo'), piece('PAGE_PIECE'));
  const inner = ctx.register(ctx.stream(new Uint8Array([0, 128, 255, 64]), {
    Type: 'XObject', Subtype: 'Image', Width: 2, Height: 2, ColorSpace: 'DeviceGray', BitsPerComponent: 8,
    Metadata: xmp('INNER_IMG'), PieceInfo: piece('INNER_IMG_PIECE'),
  }));
  const form = ctx.register(ctx.stream('0.5 g 0 0 5 5 re f', {
    Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10], Metadata: xmp('FORM'),
    Resources: { XObject: { In: inner } },
  }));
  const fname = p2.node.newXObject('Fx1', form);
  p2.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, 1, 100, 100), drawObject(fname), popGraphicsState());

  // Catalog: XMP with history, scripts, attachments.
  doc.catalog.set(N('Metadata'), xmp('CATALOG'));
  doc.catalog.set(N('AA'), ctx.obj({ WC: js('CATALOG_SCRIPT') }));
  doc.catalog.set(N('OpenAction'), ctx.register(js('OPEN_SCRIPT')));
  const keepMe = attachment('keep.txt', 'KEEP_PAYLOAD');
  const dropMe = attachment('drop.txt', 'DROP_PAYLOAD');
  doc.catalog.set(N('Names'), ctx.obj({
    EmbeddedFiles: { Kids: [ctx.obj({ Names: [PDFString.of('keep.txt'), keepMe, PDFString.of('drop.txt'), dropMe] })] },
    JavaScript: { Names: [PDFString.of('DocJs'), js('NAMED_SCRIPT')] },
  }));
  doc.catalog.set(N('AF'), ctx.obj([attachment('catalog-af.txt', 'AF_PAYLOAD')]));

  // Info: standard and custom keys.
  const info = doc.getInfoDict();
  doc.setTitle('The Title');
  doc.setAuthor('The Author');
  doc.setSubject('The Subject');
  doc.setKeywords(['alpha', 'beta']);
  doc.setProducer('Some Producer');
  doc.setCreator('Some Creator');
  doc.setCreationDate(new Date(Date.UTC(2026, 2, 7, 14, 15, 2)));
  doc.setModificationDate(new Date(Date.UTC(2026, 2, 8, 9, 0, 0)));
  info.set(N('Company'), PDFString.of('Acme'));
  info.set(N('SourceModified'), PDFString.of('D:20260101000000'));

  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(SOURCE_ID_HEX), PDFHexString.of(SOURCE_ID_HEX)]);
  return { doc, save: async () => new Uint8Array(await doc.save({ useObjectStreams: false })) };
}
