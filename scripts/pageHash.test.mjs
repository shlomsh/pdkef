import { describe, expect, it } from 'vitest';
import { pageHash } from './pageHash.mjs';

describe('pageHash', () => {
  it('is the first 16 hex characters of the SHA-256 of the bytes', () => {
    // sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(pageHash('abc')).toBe('ba7816bf8f01cfea');
    expect(pageHash(Buffer.from('abc'))).toBe('ba7816bf8f01cfea');
  });
});
