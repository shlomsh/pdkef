import { describe, expect, it } from 'vitest';
import { hasPdfHeader } from './pdfHeader.ts';

const ascii = (s: string) => new TextEncoder().encode(s);

describe('hasPdfHeader', () => {
  it('finds the header at the start', () => expect(hasPdfHeader(ascii('%PDF-1.7\nrest'))).toBe(true));
  it('finds the header after leading junk', () => expect(hasPdfHeader(ascii('junk\n\n%PDF-1.4\n'))).toBe(true));
  it('is false without a header', () => expect(hasPdfHeader(ascii('just some notes'))).toBe(false));
  it('is false for empty bytes', () => expect(hasPdfHeader(new Uint8Array(0))).toBe(false));
  it('is false for a partial header at the very end', () => expect(hasPdfHeader(ascii('text %PDF'))).toBe(false));
});
