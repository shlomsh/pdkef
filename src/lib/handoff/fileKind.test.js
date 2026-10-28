import { describe, expect, it } from 'vitest';
import { deriveFileKind, mimeTypeOf } from './fileKind.js';

function makeFile(name, type) {
  return new File([''], name, { type });
}

describe('deriveFileKind', () => {
  it('reads application/pdf as pdf', () => {
    expect(deriveFileKind(makeFile('doc.pdf', 'application/pdf'))).toBe('pdf');
  });

  it('reads image/jpeg as image', () => {
    expect(deriveFileKind(makeFile('photo.jpg', 'image/jpeg'))).toBe('image');
  });

  it('reads image/png as image', () => {
    expect(deriveFileKind(makeFile('photo.png', 'image/png'))).toBe('image');
  });

  it('falls back to the extension when type is empty - pdf', () => {
    expect(deriveFileKind(new File([], 'scan.PDF', { type: '' }))).toBe('pdf');
  });

  it('falls back to the extension when type is empty - image', () => {
    expect(deriveFileKind(new File([], 'photo.JPG', { type: '' }))).toBe('image');
  });

  it('lets a non-empty unknown MIME type win over a .pdf name', () => {
    expect(deriveFileKind(makeFile('doc.pdf', 'application/octet-stream'))).toBeNull();
  });

  it('returns null when there is no extension to fall back to', () => {
    expect(deriveFileKind(new File([], 'noext', { type: '' }))).toBeNull();
  });

  it('returns null for a null file', () => {
    expect(deriveFileKind(null)).toBeNull();
  });
});

describe('mimeTypeOf (MERGE-22)', () => {
  it.each([
    [new File(['x'], 'a.pdf', { type: 'application/pdf' }), 'application/pdf'],
    [new File(['x'], 'a.PDF'), 'application/pdf'],
    [new File(['x'], 'p.JPG'), 'image/jpeg'],
    [new File(['x'], 'p.jpeg'), 'image/jpeg'],
    [new File(['x'], 'p.png'), 'image/png'],
    [new File(['x'], 'p.png', { type: 'image/png' }), 'image/png'],
    [new File(['x'], 'notes.txt'), null],
    [new File(['x'], 'notes.txt', { type: 'text/plain' }), null],
  ])('%s -> %s', (file, expected) => {
    expect(mimeTypeOf(file)).toBe(expected);
  });
});
