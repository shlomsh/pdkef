import { describe, expect, it } from 'vitest';
import { compressedFileName } from './outputName.ts';

describe('compressedFileName', () => {
  it('names a compressed PDF by the output type, with the suffix', () => {
    expect(compressedFileName('test_doc.pdf', 'application/pdf')).toBe('test_doc-compressed.pdf');
  });

  it('names a passthrough PNG download by its own type', () => {
    expect(compressedFileName('id-scan.png', 'image/png')).toBe('id-scan-compressed.png');
  });

  it('names a re-encoded photo a JPG whatever the input extension was', () => {
    expect(compressedFileName('id-scan.png', 'image/jpeg')).toBe('id-scan-compressed.jpg');
  });
});
