/**
 * Minimal PDF content-stream tokenizer.
 *
 * This exists so `pdfObjects.js` can find the exact byte span of a drawing
 * operation (an image placement, a `BT`/`ET` text run) and delete it. pdf.js
 * can tell us *what* a page draws, but not *where in the stream* it is written,
 * and we need the offsets to rewrite the stream without touching anything else.
 *
 * Only the lexical layer lives here. Graphics-state interpretation is the
 * caller's job.
 */

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([
  0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25,
]);

const isWhitespace = (byte) => WHITESPACE.has(byte);
const isDelimiter = (byte) => DELIMITERS.has(byte);
const isRegular = (byte) => !isWhitespace(byte) && !isDelimiter(byte);

/**
 * Decodes a PDF name token (`/Foo#20Bar`), resolving `#xx` escapes.
 */
function decodeName(bytes, start, end) {
  let out = '';
  for (let i = start; i < end; i += 1) {
    if (bytes[i] === 0x23 && i + 2 < end) {
      const hex = String.fromCharCode(bytes[i + 1], bytes[i + 2]);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/**
 * Decodes a hex string `<4B45>` to the bytes it denotes.
 *
 * A hex string is a byte string written in hex, not text: returning the hex
 * characters themselves would double the apparent length of every run and put
 * the wrong glyph codes through the width lookup. Whitespace inside is legal
 * and ignored, and an odd final digit is padded with `0` per the spec.
 */
function decodeHexString(bytes, start, end) {
  const digits = [];
  for (let i = start; i < end; i += 1) {
    const byte = bytes[i];
    const isHexDigit =
      (byte >= 0x30 && byte <= 0x39) ||
      (byte >= 0x41 && byte <= 0x46) ||
      (byte >= 0x61 && byte <= 0x66);
    if (isHexDigit) digits.push(byte);
  }
  if (digits.length % 2 === 1) digits.push(0x30);

  const out = new Uint8Array(digits.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(
      String.fromCharCode(digits[i * 2], digits[i * 2 + 1]),
      16,
    );
  }
  return out;
}

/**
 * Decodes a literal string `(...)`, honouring backslash escapes and the
 * balanced inner parens PDF allows unescaped.
 *
 * This has to actually decode the escapes, not just skip over them to find
 * the closing paren: a two-byte Identity-H run pairs up consecutive raw bytes
 * to form glyph codes, and any byte that needed escaping in the source
 * (`\t`, `\b`, an octal `\ddd`, a literal `(`/`)`/`\`) is written as two or
 * four *source* characters for one *actual* byte. Returning those source
 * characters unresolved desyncs every 2-byte pairing for the rest of the
 * string - not just at the escaped byte, everything after it - which reads
 * as random glyphs going missing or a run's width coming out wrong depending
 * on where in the string the escape falls.
 *
 * @param {Uint8Array} bytes
 * @param {number} start index of the character right after the opening `(`
 * @returns {{value: Uint8Array, end: number}} end is just past the closer
 */
function decodeLiteralString(bytes, start) {
  const out = [];
  let depth = 0;
  let i = start;
  while (i < bytes.length) {
    const byte = bytes[i];

    if (byte === 0x5c) {
      const next = bytes[i + 1];
      switch (next) {
        case 0x6e: out.push(0x0a); i += 2; continue; // \n
        case 0x72: out.push(0x0d); i += 2; continue; // \r
        case 0x74: out.push(0x09); i += 2; continue; // \t
        case 0x62: out.push(0x08); i += 2; continue; // \b
        case 0x66: out.push(0x0c); i += 2; continue; // \f
        case 0x28: out.push(0x28); i += 2; continue; // \(
        case 0x29: out.push(0x29); i += 2; continue; // \)
        case 0x5c: out.push(0x5c); i += 2; continue; // \\
        case 0x0d: // line continuation: backslash + CR(LF) contributes nothing
          i += bytes[i + 2] === 0x0a ? 3 : 2;
          continue;
        case 0x0a: // line continuation: backslash + LF contributes nothing
          i += 2;
          continue;
        default:
          if (next >= 0x30 && next <= 0x37) {
            // Up to three octal digits.
            let value = 0;
            let digits = 0;
            let j = i + 1;
            while (digits < 3 && bytes[j] >= 0x30 && bytes[j] <= 0x37) {
              value = value * 8 + (bytes[j] - 0x30);
              j += 1;
              digits += 1;
            }
            out.push(value & 0xff);
            i = j;
            continue;
          }
          // Spec: an unrecognized escape drops the backslash and keeps the
          // character as-is (a producer escaping a byte that needs none).
          if (next !== undefined) {
            out.push(next);
            i += 2;
            continue;
          }
          i += 1;
          continue;
      }
    }

    if (byte === 0x28) {
      depth += 1;
      out.push(byte);
      i += 1;
      continue;
    }
    if (byte === 0x29) {
      if (depth === 0) return { value: Uint8Array.from(out), end: i + 1 };
      depth -= 1;
      out.push(byte);
      i += 1;
      continue;
    }

    out.push(byte);
    i += 1;
  }
  return { value: Uint8Array.from(out), end: bytes.length };
}

/**
 * Skips an inline image (`BI ... ID <raw bytes> EI`). The payload between `ID`
 * and `EI` is arbitrary binary and must never be lexed as operators, so this
 * scans for a whitespace-delimited `EI` instead.
 */
function skipInlineImage(bytes, start) {
  let i = start;
  while (i < bytes.length - 1) {
    if (bytes[i] === 0x49 && bytes[i + 1] === 0x44) {
      i += 2;
      break;
    }
    i += 1;
  }
  i += 1;
  while (i < bytes.length - 1) {
    const atBoundary = i === 0 || isWhitespace(bytes[i - 1]);
    const endsToken = i + 2 >= bytes.length || !isRegular(bytes[i + 2]);
    if (atBoundary && bytes[i] === 0x45 && bytes[i + 1] === 0x49 && endsToken) {
      return i + 2;
    }
    i += 1;
  }
  return bytes.length;
}

/**
 * Lexes a decoded content stream.
 *
 * Composite operands (arrays, dictionaries) are returned as single tokens whose
 * `value` holds their own nested token list, because operators such as `TJ`
 * need to read inside them.
 *
 * @param {Uint8Array} bytes decoded content stream
 * @returns {Array<{type: string, value: *, start: number, end: number}>}
 */
export function tokenize(bytes) {
  const tokens = [];
  const stack = [tokens];
  let i = 0;

  const push = (token) => stack[stack.length - 1].push(token);

  while (i < bytes.length) {
    const byte = bytes[i];

    if (isWhitespace(byte)) {
      i += 1;
      continue;
    }

    // Comment: runs to end of line.
    if (byte === 0x25) {
      while (i < bytes.length && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i += 1;
      continue;
    }

    const start = i;

    if (byte === 0x2f) {
      i += 1;
      while (i < bytes.length && isRegular(bytes[i])) i += 1;
      push({ type: 'name', value: decodeName(bytes, start + 1, i), start, end: i });
      continue;
    }

    if (byte === 0x28) {
      const decoded = decodeLiteralString(bytes, i + 1);
      push({ type: 'string', value: decoded.value, start, end: decoded.end });
      i = decoded.end;
      continue;
    }

    // `<<` opens a dictionary, a lone `<` opens a hex string.
    if (byte === 0x3c && bytes[i + 1] === 0x3c) {
      const dict = { type: 'dict', value: [], start, end: -1 };
      push(dict);
      stack.push(dict.value);
      i += 2;
      continue;
    }
    if (byte === 0x3e && bytes[i + 1] === 0x3e) {
      i += 2;
      if (stack.length > 1) {
        stack.pop();
        const parent = stack[stack.length - 1];
        parent[parent.length - 1].end = i;
      }
      continue;
    }
    if (byte === 0x3c) {
      i += 1;
      while (i < bytes.length && bytes[i] !== 0x3e) i += 1;
      i += 1;
      push({
        type: 'hexstring',
        value: decodeHexString(bytes, start + 1, i - 1),
        start,
        end: i,
      });
      continue;
    }

    if (byte === 0x5b) {
      const arr = { type: 'array', value: [], start, end: -1 };
      push(arr);
      stack.push(arr.value);
      i += 1;
      continue;
    }
    if (byte === 0x5d) {
      i += 1;
      if (stack.length > 1) {
        stack.pop();
        const parent = stack[stack.length - 1];
        parent[parent.length - 1].end = i;
      }
      continue;
    }

    // Number, or a bare keyword operator.
    while (i < bytes.length && isRegular(bytes[i])) i += 1;
    if (i === start) {
      // An unexpected delimiter we do not model; consume it so we cannot loop.
      i += 1;
      continue;
    }

    let text = '';
    for (let k = start; k < i; k += 1) text += String.fromCharCode(bytes[k]);

    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) {
      push({ type: 'number', value: parseFloat(text), start, end: i });
      continue;
    }

    if (text === 'BI') {
      const end = skipInlineImage(bytes, i);
      push({ type: 'inlineimage', value: 'BI', start, end });
      i = end;
      continue;
    }

    push({ type: 'operator', value: text, start, end: i });
  }

  return tokens;
}

/** Multiplies two PDF matrices given as `[a, b, c, d, e, f]`. */
export function multiplyMatrix(m1, m2) {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

/** Applies a PDF matrix to a point, returning `[x, y]`. */
export function applyMatrix(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Axis-aligned bounding box of the unit square transformed by `m`. */
export function transformedUnitBox(m) {
  const corners = [
    applyMatrix(m, 0, 0),
    applyMatrix(m, 1, 0),
    applyMatrix(m, 0, 1),
    applyMatrix(m, 1, 1),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
