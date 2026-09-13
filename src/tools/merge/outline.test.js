import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFHexString } from '@cantoo/pdf-lib';
import { addFileOutline } from './outline.js';

// Unit-level proof that addFileOutline() writes a spec-shaped /Outlines
// chain, independent of mergePdfs() and the page-plan bookkeeping that
// decides *which* entries to pass in (that half is covered in
// merge.test.js's MERGE-15 describe block, against real merged fixtures).
describe('addFileOutline', () => {
  async function makeDoc(pageCount) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i += 1) doc.addPage([100, 100]);
    return doc;
  }

  // Walks the /Outlines chain from /First to /Last via /Next, returning one
  // record per item - the same traversal any real viewer does to render a
  // bookmark panel, so this is the closest jsdom-only proxy for "does a
  // viewer see the right list".
  function readOutlineChain(pdfDoc) {
    const catalog = pdfDoc.catalog;
    const outlinesRef = catalog.get(PDFName.of('Outlines'));
    if (!outlinesRef) return null;
    const outlines = pdfDoc.context.lookup(outlinesRef);

    const items = [];
    let currentRef = outlines.get(PDFName.of('First'));
    let prevRef;
    while (currentRef) {
      const item = pdfDoc.context.lookup(currentRef);
      const dest = item.get(PDFName.of('Dest'));
      items.push({
        ref: currentRef,
        title: item.get(PDFName.of('Title')).decodeText(),
        destPageRef: dest.get(0),
        prev: item.get(PDFName.of('Prev')),
        next: item.get(PDFName.of('Next')),
      });
      prevRef = currentRef;
      currentRef = item.get(PDFName.of('Next'));
    }
    return {
      type: outlines.get(PDFName.of('Type'))?.encodedName,
      first: outlines.get(PDFName.of('First')),
      last: outlines.get(PDFName.of('Last')),
      count: outlines.get(PDFName.of('Count'))?.asNumber(),
      items,
    };
  }

  it('writes a Type/First/Last/Count outline root and one item per entry, in the given order', async () => {
    const doc = await makeDoc(3);
    addFileOutline(doc, [
      { title: 'Alpha', pageIndex: 0 },
      { title: 'Beta', pageIndex: 2 },
    ]);

    const bytes = await doc.save();
    const reloaded = await PDFDocument.load(bytes);
    const outline = readOutlineChain(reloaded);

    expect(outline.count).toBe(2);
    expect(outline.items).toHaveLength(2);
    expect(outline.items.map((i) => i.title)).toEqual(['Alpha', 'Beta']);
    expect(outline.first.toString()).toBe(outline.items[0].ref.toString());
    expect(outline.last.toString()).toBe(outline.items[1].ref.toString());
  });

  it('points each entry\'s Dest at the expected page ref, and chains Prev/Next correctly', async () => {
    const doc = await makeDoc(3);
    addFileOutline(doc, [
      { title: 'First file', pageIndex: 0 },
      { title: 'Second file', pageIndex: 1 },
      { title: 'Third file', pageIndex: 2 },
    ]);

    const bytes = await doc.save();
    const reloaded = await PDFDocument.load(bytes);
    const outline = readOutlineChain(reloaded);

    const expectedRefs = [0, 1, 2].map((i) => reloaded.getPage(i).ref.toString());
    expect(outline.items.map((i) => i.destPageRef.toString())).toEqual(expectedRefs);

    // Prev/Next chain: first has no Prev, last has no Next, middle points
    // both ways to its neighbours' refs.
    expect(outline.items[0].prev).toBeUndefined();
    expect(outline.items[0].next.toString()).toBe(outline.items[1].ref.toString());
    expect(outline.items[1].prev.toString()).toBe(outline.items[0].ref.toString());
    expect(outline.items[1].next.toString()).toBe(outline.items[2].ref.toString());
    expect(outline.items[2].prev.toString()).toBe(outline.items[1].ref.toString());
    expect(outline.items[2].next).toBeUndefined();
  });

  it('titles survive PDFHexString round-tripping non-Latin script', async () => {
    const doc = await makeDoc(1);
    addFileOutline(doc, [{ title: 'דוח מס', pageIndex: 0 }]);

    const bytes = await doc.save();
    const reloaded = await PDFDocument.load(bytes);
    const outline = readOutlineChain(reloaded);

    expect(outline.items[0].title).toBe('דוח מס');
  });

  it('is a no-op (writes no /Outlines at all) for an empty entries list', async () => {
    const doc = await makeDoc(2);
    addFileOutline(doc, []);

    const bytes = await doc.save();
    const reloaded = await PDFDocument.load(bytes);

    expect(reloaded.catalog.get(PDFName.of('Outlines'))).toBeUndefined();
  });

  it('PDFHexString.fromText really does prepend a UTF-16BE BOM (the mechanism this relies on)', () => {
    const hex = PDFHexString.fromText('א');
    const bytes = hex.asBytes();
    // BOM (FE FF) then the two bytes of Hebrew Alef (U+05D0) in UTF-16BE.
    expect(Array.from(bytes.slice(0, 2))).toEqual([0xfe, 0xff]);
    expect(Array.from(bytes.slice(2, 4))).toEqual([0x05, 0xd0]);
  });
});
