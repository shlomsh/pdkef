import { describe, expect, it } from 'vitest';
import { tokenize, multiplyMatrix, applyMatrix, transformedUnitBox } from './contentStream.js';

const lex = (source) => tokenize(new TextEncoder().encode(source));
const ops = (source) => lex(source).filter((t) => t.type === 'operator').map((t) => t.value);

/**
 * Every non-whitespace byte must belong to some token. A gap means the lexer
 * lost its place, which would make the byte offsets we splice on meaningless.
 */
function assertFullyLexed(source) {
  const bytes = new TextEncoder().encode(source);
  const covered = new Uint8Array(bytes.length);
  for (const token of tokenize(bytes)) {
    for (let i = token.start; i < token.end; i += 1) covered[i] = 1;
  }
  const whitespace = new Set([0, 9, 10, 12, 13, 32]);
  const missed = [];
  for (let i = 0; i < bytes.length; i += 1) {
    if (!covered[i] && !whitespace.has(bytes[i])) missed.push(i);
  }
  expect(missed).toEqual([]);
}

describe('tokenize', () => {
  it('reads operators, numbers and names', () => {
    const tokens = lex('1 0 0 1 50 700 cm /F1 12 Tf');
    expect(tokens.filter((t) => t.type === 'number').map((t) => t.value)).toEqual([
      1, 0, 0, 1, 50, 700, 12,
    ]);
    expect(tokens.filter((t) => t.type === 'name').map((t) => t.value)).toEqual(['F1']);
    expect(ops('1 0 0 1 50 700 cm /F1 12 Tf')).toEqual(['cm', 'Tf']);
  });

  it('reports byte offsets that map back to the source', () => {
    const source = 'BT /F1 12 Tf (hi) Tj ET';
    const et = lex(source).find((t) => t.value === 'ET');
    expect(source.slice(et.start, et.end)).toBe('ET');
  });

  it('handles escaped and nested parens inside a string', () => {
    // The `\)` must not close the string, and the inner `()` pair must balance.
    const source = '(a\\)b (c) d) Tj';
    expect(ops(source)).toEqual(['Tj']);
    assertFullyLexed(source);
  });

  describe('literal string escapes', () => {
    // A real PDF from RealObjects PDFreactor shipped a Type0/Identity-H run
    // whose string used \b and \t for two of its 2-byte glyph codes. Returning
    // those as the raw source characters `\`, `b`, `\`, `t` instead of the
    // single decoded bytes 0x08/0x09 shifted every 2-byte code pairing for the
    // rest of the string - not just the escaped glyph, everything after it -
    // which showed up as missing/wrong Hebrew letters in a Redact-tool preview
    // and, worse, a wrong bounding box width for the whole run.
    const decodedBytes = (source) => lex(source).find((t) => t.type === 'string').value;
    const decoded = (source) => Array.from(decodedBytes(source));

    it('decodes the standard single-character escapes', () => {
      expect(decoded('(\\n)')).toEqual([0x0a]);
      expect(decoded('(\\r)')).toEqual([0x0d]);
      expect(decoded('(\\t)')).toEqual([0x09]);
      expect(decoded('(\\b)')).toEqual([0x08]);
      expect(decoded('(\\f)')).toEqual([0x0c]);
      expect(decoded('(\\()')).toEqual([0x28]);
      expect(decoded('(\\))')).toEqual([0x29]);
      expect(decoded('(\\\\)')).toEqual([0x5c]);
    });

    it('decodes octal escapes up to three digits, and stops at the third', () => {
      expect(decoded('(\\101)')).toEqual([0x41]); // 'A'
      expect(decoded('(\\1014)')).toEqual([0x41, 0x34]); // 'A' + literal '4'
      expect(decoded('(\\0)')).toEqual([0x00]);
    });

    it('drops a line-continuation backslash-newline entirely', () => {
      expect(decoded('(a\\\nb)')).toEqual([0x61, 0x62]);
      expect(decoded('(a\\\r\nb)')).toEqual([0x61, 0x62]);
    });

    it('drops the backslash and keeps the character for an unrecognized escape', () => {
      // Per spec: a backslash before anything not in the escape table is
      // ignored, and the character is taken literally - a producer escaping
      // a byte that needed no escaping.
      expect(decoded('(\\g)')).toEqual([0x67]); // 'g'
    });

    it('leaves unescaped bytes, including nested balanced parens, untouched', () => {
      expect(decoded('(a(b)c)')).toEqual([...'a(b)c'].map((c) => c.charCodeAt(0)));
    });

    it('does not desync a two-byte code pairing around an escape mid-string', () => {
      // The bug this guards: four raw glyph-code bytes where the second one
      // (0x09) is written as the two-character escape \t. Decoding must yield
      // exactly four bytes (two 2-byte codes: 0x0109 and 0x0203), not five -
      // which is what leaving `\` and `t` as separate, un-decoded source
      // characters would produce, shifting every code pairing after it.
      const source = '(' + String.fromCharCode(0x01) + '\\t' + String.fromCharCode(0x02, 0x03) + ')';
      expect(decoded(source)).toEqual([0x01, 0x09, 0x02, 0x03]);
    });
  });

  it('keeps a TJ array as one token holding its own contents', () => {
    const array = lex('[(A) -250 (B)] TJ').find((t) => t.type === 'array');
    expect(array.value.map((t) => t.type)).toEqual(['string', 'number', 'string']);
    expect(array.value[1].value).toBe(-250);
  });

  it('parses negative and bare-decimal numbers', () => {
    const numbers = lex('-3.5 .25 +2 0 Td').filter((t) => t.type === 'number');
    expect(numbers.map((t) => t.value)).toEqual([-3.5, 0.25, 2, 0]);
  });

  it('resolves #xx escapes in names', () => {
    expect(lex('/A#20B Do')[0].value).toBe('A B');
  });

  it('reads a dictionary as one token', () => {
    const tokens = lex('/Span <</MCID 0>> BDC');
    expect(tokens.map((t) => t.type)).toEqual(['name', 'dict', 'operator']);
  });

  it('skips comments', () => {
    expect(ops('% a comment with (parens\n1 0 0 1 0 0 cm')).toEqual(['cm']);
  });

  it('skips inline image payloads without lexing the binary as operators', () => {
    // The payload deliberately contains bytes that would otherwise read as
    // operators and an unbalanced paren.
    const source = 'BI /W 2 /H 2 ID QqBTET(( EI Q';
    expect(ops(source)).toEqual(['Q']);
    assertFullyLexed(source);
  });

  it('terminates on an unbalanced array without hanging', () => {
    expect(() => lex('[(a) 1 Tj')).not.toThrow();
  });
});

describe('matrix helpers', () => {
  it('composes translation after scale the way cm does', () => {
    const scaled = multiplyMatrix([2, 0, 0, 2, 0, 0], [1, 0, 0, 1, 10, 20]);
    expect(applyMatrix(scaled, 1, 1)).toEqual([12, 22]);
  });

  it('boxes the unit square under a scale and translate', () => {
    const box = transformedUnitBox([36.75, 0, 0, 36.75, 501.8, 794.3]);
    expect(box.x).toBeCloseTo(501.8);
    expect(box.y).toBeCloseTo(794.3);
    expect(box.width).toBeCloseTo(36.75);
    expect(box.height).toBeCloseTo(36.75);
  });

  it('boxes a rotated unit square by its axis-aligned extent', () => {
    // 90 degrees: the unit square still spans one unit on each axis.
    const box = transformedUnitBox([0, 1, -1, 0, 10, 10]);
    expect(box.x).toBeCloseTo(9);
    expect(box.y).toBeCloseTo(10);
    expect(box.width).toBeCloseTo(1);
    expect(box.height).toBeCloseTo(1);
  });
});
