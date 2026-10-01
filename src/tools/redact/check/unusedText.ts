/**
 * RED-49: reads the text out of a part of the file no page shows. Pure; bytes
 * and strings in, strings out, so the same reading runs in a unit test, in
 * Node and in the island. `unusedParts.ts` feeds it the unreachable objects of
 * a pdf-lib document.
 *
 * What it reads from a content stream is the operand of a text-showing
 * operator inside BT..ET: a literal `( )` or hex `< >` string, alone (Tj, ',
 * ") or in a TJ array. A word the writer kerned into pieces, `[(Left) -20
 * (over)] TJ`, reads whole. Text drawn with an Identity-H font is glyph ids,
 * not letters, so it does not read here; that is accepted, and the check
 * says it searched the text it could read.
 */

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const isRegular = (byte: number): boolean => !WHITESPACE.has(byte) && !DELIMITERS.has(byte);

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const SHOW_OPERATORS = new Set(['Tj', 'TJ', "'", '"']);

/** A string's bytes as text: UTF-16BE when it starts with FE FF, else one
 * character per byte (PDFDocEncoding and latin1 agree on the letters that
 * matter here). */
export function decodePdfText(bytes: ArrayLike<number>): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return text;
  }
  let text = '';
  for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);
  return text;
}

const OCTAL = (byte: number): boolean => byte >= 0x30 && byte <= 0x37;

/** Reads the literal string whose `(` is at `start`; returns its bytes and the index after the `)`. */
function readLiteral(data: Uint8Array, start: number): { bytes: number[]; end: number } {
  const bytes: number[] = [];
  let depth = 1;
  let i = start + 1;
  while (i < data.length) {
    const byte = data[i];
    i += 1;
    if (byte === 0x5c) {
      // A backslash: an escape, an octal code, or a line continuation.
      const next = data[i];
      if (next === undefined) break;
      i += 1;
      if (next === 0x6e) bytes.push(0x0a);
      else if (next === 0x72) bytes.push(0x0d);
      else if (next === 0x74) bytes.push(0x09);
      else if (next === 0x62) bytes.push(0x08);
      else if (next === 0x66) bytes.push(0x0c);
      else if (OCTAL(next)) {
        let code = next - 0x30;
        for (let digits = 1; digits < 3 && i < data.length && OCTAL(data[i]); digits += 1) {
          code = code * 8 + (data[i] - 0x30);
          i += 1;
        }
        bytes.push(code & 0xff);
      } else if (next === 0x0d) {
        if (data[i] === 0x0a) i += 1;
      } else if (next !== 0x0a) bytes.push(next);
    } else if (byte === 0x28) {
      depth += 1;
      bytes.push(byte);
    } else if (byte === 0x29) {
      depth -= 1;
      if (depth === 0) break;
      bytes.push(byte);
    } else bytes.push(byte);
  }
  return { bytes, end: i };
}

const hexValue = (byte: number): number => {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x41 + 10;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x61 + 10;
  return -1;
};

/** Reads the hex string whose `<` is at `start`; an odd last digit counts as followed by 0. */
function readHex(data: Uint8Array, start: number): { bytes: number[]; end: number } {
  const bytes: number[] = [];
  let high = -1;
  let i = start + 1;
  while (i < data.length && data[i] !== 0x3e) {
    const value = hexValue(data[i]);
    i += 1;
    if (value < 0) continue;
    if (high < 0) high = value;
    else {
      bytes.push(high * 16 + value);
      high = -1;
    }
  }
  if (high >= 0) bytes.push(high * 16);
  return { bytes, end: i + 1 };
}

/** The index just after the `EI` that ends the inline image whose `BI` was just read. */
function skipInlineImage(data: Uint8Array, afterBI: number): number {
  let from = data.length;
  for (let i = afterBI; i + 2 < data.length; i += 1) {
    if (data[i] === 0x49 && data[i + 1] === 0x44 && WHITESPACE.has(data[i - 1]) && WHITESPACE.has(data[i + 2])) {
      from = i + 3;
      break;
    }
  }
  for (let i = from; i + 1 < data.length; i += 1) {
    if (data[i] !== 0x45 || data[i + 1] !== 0x49) continue;
    const before = i === from || WHITESPACE.has(data[i - 1]);
    const after = i + 2 >= data.length || !isRegular(data[i + 2]);
    if (before && after) return i + 2;
  }
  return data.length;
}

/**
 * The text each BT..ET block of a content stream shows, one string per block.
 * A block that shows more than one string is also given with its strings
 * separated by spaces, so a phrase split over several Tj operators is found
 * both whole and as separate words.
 */
export function contentStreamTexts(data: Uint8Array): string[] {
  const blocks: string[] = [];
  let inText = false;
  let pending: string[] = [];
  let shown: string[] = [];

  const endBlock = (): void => {
    if (shown.length > 0) {
      blocks.push(shown.join(''));
      if (shown.length > 1) blocks.push(shown.join(' '));
    }
    shown = [];
    pending = [];
    inText = false;
  };

  let i = 0;
  while (i < data.length) {
    const byte = data[i];
    if (WHITESPACE.has(byte)) {
      i += 1;
    } else if (byte === 0x25) {
      while (i < data.length && data[i] !== 0x0a && data[i] !== 0x0d) i += 1;
    } else if (byte === 0x28) {
      const { bytes, end } = readLiteral(data, i);
      if (inText) pending.push(decodePdfText(bytes));
      i = end;
    } else if (byte === 0x3c && data[i + 1] !== 0x3c) {
      const { bytes, end } = readHex(data, i);
      if (inText) pending.push(decodePdfText(bytes));
      i = end;
    } else if (byte === 0x2f) {
      i += 1;
      while (i < data.length && isRegular(data[i])) i += 1;
    } else if (isRegular(byte)) {
      const from = i;
      while (i < data.length && isRegular(data[i])) i += 1;
      let word = '';
      for (let k = from; k < i; k += 1) word += String.fromCharCode(data[k]);
      if (word === 'BT') {
        if (inText) endBlock();
        inText = true;
      } else if (word === 'ET') {
        endBlock();
      } else if (word === 'BI') {
        // An inline image's data is binary and may hold anything.
        i = skipInlineImage(data, i);
      } else if (inText && SHOW_OPERATORS.has(word)) {
        if (pending.length > 0) shown.push(pending.join(''));
        pending = [];
      } else if (!NUMBER.test(word)) {
        // Any other operator ends the operands collected for it. Numbers are
        // not operators: they sit between the strings of a TJ array.
        pending = [];
      }
    } else {
      // Brackets, braces, `<<`, `>>`, a stray `)`: not text.
      i += 1;
    }
  }
  endBlock();
  return blocks;
}
