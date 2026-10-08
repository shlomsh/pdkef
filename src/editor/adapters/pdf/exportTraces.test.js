// RED-59: what a saved export carries of the source's details, end to end in Node.
// Delete is run for real; the flattened path through `assemble`, which holds
// everything `redactPdf` does after the canvas work.
import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, decodePDFRawStream } from '@cantoo/pdf-lib';
import { deleteObjectsFromPdf } from './deleteObjects.js';
import { assemble } from './redact.js';
import { readDocumentTraces, hasNoTraces } from './documentTraces.js';
import { buildTracesFixture, SOURCE_ID_HEX } from './tracesFixture.test-helper.js';

const JPEG = Uint8Array.from(Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
));

const paths = {
  async delete(bytes, options) {
    const blob = await deleteObjectsFromPdf(bytes, [], undefined, options);
    return new Uint8Array(await blob.arrayBuffer());
  },
  async flattened(bytes, options) {
    const source = await PDFDocument.load(bytes);
    return new Uint8Array(await assemble(source, new Map([[0, { jpeg: JPEG, width: 300, height: 300 }]]), options));
  },
};

async function sourceBytes() {
  return (await buildTracesFixture()).save();
}

describe.each(Object.keys(paths))('%s export', (path) => {
  const run = (options) => sourceBytes().then((b) => paths[path](b, options));

  it('carries no traces of the source', async () => {
    const out = await run();
    const reloaded = await PDFDocument.load(out, { updateMetadata: false });
    expect(hasNoTraces(readDocumentTraces(reloaded))).toBe(true);
  });

  it('writes no pdf-lib name or dates into Info, and no custom key', async () => {
    const out = await run();
    const text = Buffer.from(out).toString('latin1');
    expect(text).not.toContain('pdf-lib');
    expect(text).not.toContain('Acme');
    const reloaded = await PDFDocument.load(out, { updateMetadata: false });
    const info = reloaded.context.trailerInfo.Info;
    const dict = info ? reloaded.context.lookup(info) : undefined;
    expect(dict ? [...dict.keys()] : []).toEqual([]);
  });

  it('writes a trailer ID that is not the source ID', async () => {
    const out = await run();
    const text = Buffer.from(out).toString('latin1');
    const id = text.match(/\/ID\s*\[([^\]]*)\]/);
    expect(id).not.toBeNull();
    expect(id[1]).not.toContain(SOURCE_ID_HEX);
  });

  // The flattened path copies pages, not the catalog, so only the file
  // attached as a comment on page 2 can be there to keep.
  const kept = path === 'delete' ? 'keep.txt' : 'comment.txt';
  it('keeps an attachment named in keepAttachments, and drops the rest', async () => {
    const out = await run({ keepAttachments: [kept] });
    const reloaded = await PDFDocument.load(out, { updateMetadata: false });
    expect(readDocumentTraces(reloaded).attachments.map((a) => a.name)).toEqual([kept]);
  });

  if (path === 'flattened') {
    it('carries a kept name-tree attachment over, bytes equal, as the only one left', async () => {
      const out = await run({ keepAttachments: ['keep.txt'] });
      const reloaded = await PDFDocument.load(out, { updateMetadata: false });
      // pdf-lib lists a file in the name tree and in /AF, so the reader sees it twice.
      const attachments = readDocumentTraces(reloaded).attachments;
      expect([...new Set(attachments.map((a) => a.name))]).toEqual(['keep.txt']);
      const names = reloaded.catalog.lookup(PDFName.of('Names'));
      const tree = names.lookup(PDFName.of('EmbeddedFiles'));
      const spec = reloaded.context.lookup(tree.lookup(PDFName.of('Names')).get(1));
      const stream = reloaded.context.lookup(spec.lookup(PDFName.of('EF')).get(PDFName.of('F')));
      const bytes = decodePDFRawStream(stream).decode();
      expect(Buffer.from(bytes).toString('latin1')).toBe('KEEP_PAYLOAD');
    });
  }

  it('runs finish on the output before the strip: a comment finish removes on page 2 is gone', async () => {
    const dropText = (doc) => {
      const annots = doc.getPage(1).node.lookup(PDFName.of('Annots'));
      for (let i = annots.size() - 1; i >= 0; i--) {
        const a = doc.context.lookup(annots.get(i));
        if (a.get(PDFName.of('Subtype')) === PDFName.of('Text')) annots.remove(i);
      }
    };
    const out = await run({ finish: dropText });
    const reloaded = await PDFDocument.load(out, { updateMetadata: false });
    const annots = reloaded.getPage(1).node.lookup(PDFName.of('Annots'));
    const subtypes = [];
    for (let i = 0; annots && i < annots.size(); i++) {
      subtypes.push(reloaded.context.lookup(annots.get(i)).get(PDFName.of('Subtype')).asString());
    }
    expect(subtypes).not.toContain('/Text');
  });
});
