import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { dropUnreachable, unreachableRefs } from './reachability.js';
import { buildFormXObjectPdf } from './formXObjectFixture.test-helper.js';

async function simpleDoc() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([612, 792]).drawText('Visible', { x: 72, y: 700, size: 12, font });
  doc.setTitle('A title');
  return doc;
}

describe('reachability', () => {
  it('a plain document, saved either way and loaded again, has nothing unreachable', async () => {
    for (const useObjectStreams of [false, true]) {
      const saved = await (await simpleDoc()).save({ useObjectStreams });
      expect(unreachableRefs(await PDFDocument.load(saved))).toEqual([]);
    }
    const forms = await PDFDocument.load(await buildFormXObjectPdf({ nested: true, shared: true }));
    expect(unreachableRefs(forms)).toEqual([]);
  });

  it('finds a stream nothing references, and dropUnreachable removes it from the save', async () => {
    const doc = await simpleDoc();
    const orphan = doc.context.register(doc.context.stream('BT /F1 12 Tf (Hidden) Tj ET'));
    expect(unreachableRefs(doc).map((r) => r.tag)).toEqual([orphan.tag]);

    const reloaded = await PDFDocument.load(await doc.save({ useObjectStreams: false }));
    expect(unreachableRefs(reloaded)).toHaveLength(1);
    expect(dropUnreachable(reloaded)).toBe(1);
    const clean = await PDFDocument.load(await reloaded.save());
    expect(unreachableRefs(clean)).toEqual([]);
    expect(clean.getPageCount()).toBe(1);
    expect(clean.getTitle()).toBe('A title');
  });

  it('follows a chain: an orphan that references another object takes it along', async () => {
    const doc = await simpleDoc();
    const inner = doc.context.register(doc.context.obj({ Note: 'inner' }));
    const outer = doc.context.register(doc.context.obj({ Child: inner }));
    expect(unreachableRefs(doc).map((r) => r.tag).sort()).toEqual([inner.tag, outer.tag].sort());
  });
});
