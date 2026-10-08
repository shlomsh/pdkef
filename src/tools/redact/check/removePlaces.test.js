import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFString, StandardFonts } from '@cantoo/pdf-lib';
import { locatePlaces } from './placeLocator.ts';
import { removePlaces } from './removePlaces.ts';

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const png = () => Uint8Array.from(atob(PNG_1X1_BASE64), (c) => c.charCodeAt(0));

async function buildFixture() {
  const doc = await PDFDocument.create();
  doc.setTitle('title-secret');
  doc.setAuthor('author-secret');
  doc.setSubject('subject-secret');
  doc.setKeywords(['keywords-secret']);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ctx = doc.context;
  const one = doc.addPage([400, 200]);
  one.drawText('Page one', { x: 20, y: 160, size: 12, font });
  const field = doc.getForm().createTextField('the.field');
  field.setText('field-secret-value');
  field.addToPage(one, { x: 20, y: 100, width: 150, height: 20, font });
  one.node.addAnnot(
    ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [20, 60, 170, 80], Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.com/link-secret') } })),
  );
  one.node.addAnnot(
    ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [300, 150, 320, 170], Contents: PDFString.of('comment-secret') })),
  );
  await doc.attach(png(), 'attachment-one-secret.png', { mimeType: 'image/png' });
  await doc.attach(png(), 'attachment-two-secret.png', { mimeType: 'image/png' });
  // pdf-lib writes attachments at save time, so reload to have them in the object graph.
  return PDFDocument.load(await doc.save({ updateFieldAppearances: true }), { updateMetadata: false });
}

const labels = (doc) => locatePlaces(doc).map((l) => `${l.place.kind}|${l.place.pageIndex ?? ''}|${l.place.text}`);

describe('removePlaces', () => {
  it('removes each removable kind and counts them', async () => {
    const doc = await buildFixture();
    const wanted = [
      { kind: 'title', text: 'title-secret' },
      { kind: 'author', text: 'author-secret' },
      { kind: 'subject', text: 'subject-secret' },
      { kind: 'keywords', text: 'keywords-secret' },
      { kind: 'field', text: 'field-secret-value', pageIndex: 0 },
      { kind: 'link', text: 'https://example.com/link-secret', pageIndex: 0 },
      { kind: 'comment', text: 'comment-secret', pageIndex: 0 },
      { kind: 'attachment', text: 'attachment-one-secret.png' },
    ];
    expect(removePlaces(doc, wanted)).toBe(wanted.length);
    // The orphaned appearance of the cleared field is the caller's dropUnreachable to take, so 'unused' is not judged here.
    const left = labels(doc).filter((l) => !l.startsWith('unused')).join('\n');
    for (const secret of ['title-secret', 'author-secret', 'subject-secret', 'keywords-secret', 'field-secret-value', 'link-secret', 'comment-secret', 'attachment-one-secret']) {
      expect(left, secret).not.toContain(secret);
    }
    expect(left).toContain('attachment-two-secret.png');
  });

  it('skips a place that is no longer there, quietly', async () => {
    const doc = await buildFixture();
    const before = labels(doc);
    expect(removePlaces(doc, [{ kind: 'title', text: 'not there' }, { kind: 'comment', text: 'comment-secret', pageIndex: 5 }])).toBe(0);
    expect(labels(doc)).toEqual(before);
    expect(removePlaces(doc, [{ kind: 'title', text: 'title-secret' }, { kind: 'title', text: 'title-secret' }])).toBe(1);
  });

  it('two identical entries remove two identical places', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    for (const y of [10, 60, 110]) {
      page.node.addAnnot(doc.context.register(doc.context.obj({
        Type: 'Annot', Subtype: 'Text', Rect: [10, y, 30, y + 20], Contents: PDFString.of('twin'),
      })));
    }
    const twin = { kind: 'comment', text: 'twin', pageIndex: 0 };
    expect(removePlaces(doc, [twin, twin])).toBe(2);
    expect(labels(doc)).toEqual(['comment|0|twin']);
    expect(doc.getPages()[0].node.Annots().size()).toBe(1);
    expect(doc.catalog.get(PDFName.of('Outlines'))).toBeUndefined();
  });
});
