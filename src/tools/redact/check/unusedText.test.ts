import { describe, expect, it } from 'vitest';
import { contentStreamTexts, decodePdfText } from './unusedText.ts';

const bytes = (text: string): Uint8Array => Uint8Array.from(text, (ch) => ch.charCodeAt(0));
const read = (text: string): string[] => contentStreamTexts(bytes(text));

describe('decodePdfText', () => {
  it('reads latin1 bytes one by one', () => {
    expect(decodePdfText([0x43, 0x61, 0x66, 0xe9])).toBe('Café');
  });

  it('reads UTF-16BE when the string starts with FE FF', () => {
    expect(decodePdfText([0xfe, 0xff, 0x05, 0xd0, 0x05, 0xd1])).toBe('אב');
  });
});

describe('contentStreamTexts', () => {
  it('reads a literal string shown with Tj', () => {
    expect(read('BT /F1 12 Tf (Leftover) Tj ET')).toEqual(['Leftover']);
  });

  it('reads a word kerned into pieces whole', () => {
    expect(read('BT [(Left) -20 (over2)] TJ ET')).toContain('Leftover2');
  });

  it('reads a hex string, with an odd last digit and whitespace', () => {
    expect(read('BT <4c65 6674 6f7> Tj ET')).toEqual(['Leftop']);
    expect(read('BT <4c656674> Tj ET')).toEqual(['Left']);
  });

  it('reads a UTF-16BE hex string', () => {
    expect(read('BT <FEFF05D005D1> Tj ET')).toEqual(['אב']);
  });

  it('reads escapes, octal codes, nested parentheses and line continuations', () => {
    expect(read('BT (a\\(b\\)c \\101\\n(x)\\\ny) Tj ET')).toEqual(['a(b)c A\n(x)y']);
  });

  it('gives a block with several shows both joined and spaced, so a phrase is found either way', () => {
    expect(read('BT (Jane) Tj 0 -14 Td (Doe) Tj ET')).toEqual(['JaneDoe', 'Jane Doe']);
  });

  it('gives one entry per BT..ET block', () => {
    expect(read('BT (One) Tj ET BT (Two) Tj ET')).toEqual(['One', 'Two']);
  });

  it('reads the string of the quote operators', () => {
    expect(read("BT (Quoted) ' ET")).toEqual(['Quoted']);
    expect(read('BT 1 2 (Dq) " ET')).toEqual(['Dq']);
  });

  it('ignores strings that are not shown: outside BT..ET, or operands of another operator', () => {
    expect(read('(Outside) Tj BT /Span <</ActualText (Hidden)>> BDC (Shown) Tj ET')).toEqual(['Shown']);
  });

  it('skips comments and inline image data that holds string-like bytes', () => {
    expect(read('% (comment) Tj\nBT (Real) Tj ET')).toEqual(['Real']);
    expect(read('q BI /W 1 /H 1 /CS /G /BPC 8 ID (Fake) Tj EI Q BT (After) Tj ET')).toEqual(['After']);
  });

  it('keeps what it read when a block is never closed, and reads nothing from binary noise', () => {
    expect(read('BT (Open) Tj')).toEqual(['Open']);
    expect(contentStreamTexts(Uint8Array.from([0, 255, 40, 1, 2, 3]))).toEqual([]);
  });
});
