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
