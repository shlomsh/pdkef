import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readDetails } from './readDetails.ts';

describe('readDetails', () => {
  // DEBT-51: the details come from the bytes held at load, so a File that moved on disk cannot fail the read.
  it('reads the details from held bytes', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.setTitle('Held');
    const bytes = await doc.save();
    const held = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const traces = await readDetails(held);
    expect(traces.title).toBe('Held');
  });
});
