import { describe, expect, it } from 'vitest';
import { isEncryptedPdfError } from './encryptedPdfError.ts';

describe('isEncryptedPdfError', () => {
  it('knows pdf-lib\'s error by name', () => {
    expect(isEncryptedPdfError(Object.assign(new Error('x'), { name: 'EncryptedPDFError' }))).toBe(true);
  });

  it('knows it by message when a minified build lost the name', () => {
    expect(isEncryptedPdfError(new Error('Input document to `PDFDocument.load` is encrypted.'))).toBe(true);
  });

  it('is false for any other failure, or no error object at all', () => {
    expect(isEncryptedPdfError(new Error('Failed to parse'))).toBe(false);
    expect(isEncryptedPdfError(undefined)).toBe(false);
    expect(isEncryptedPdfError('is encrypted')).toBe(false);
  });
});
