import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

// Comments (this file's own, and every doc comment that mentions
// `getDocument()` in prose) would otherwise read as call sites with no
// wasmUrl.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

// Finds every `getDocument(...)` call and returns the balanced-paren span of
// its argument list, so a multi-line call (or thumbnails.js's ternary between
// two option objects) is checked as one unit rather than line by line.
function findGetDocumentCalls(source) {
  const calls = [];
  const callRegex = /getDocument\(/g;
  let match;
  while ((match = callRegex.exec(source))) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') depth--;
      i++;
    }
    calls.push(source.slice(start, i - 1));
  }
  return calls;
}

describe('pdf.js wasmUrl wiring', () => {
  // Without `wasmUrl`, pdf.js can't decode CCITT/JBIG2 images (see
  // pdfjsWasm.js's doc comment) and silently drops them from the render - a
  // scanned PDF renders as a blank or washed-out page with no error. Every
  // `getDocument()` call site must pass PDFJS_WASM_URL.
  it('every getDocument() call site passes wasmUrl', () => {
    const offenders = [];
    for (const file of walk(srcRoot)) {
      const source = fs.readFileSync(file, 'utf8');
      if (!source.includes('getDocument(')) continue;
      const rel = path.relative(srcRoot, file);
      for (const callArgs of findGetDocumentCalls(stripComments(source))) {
        if (!/\bwasmUrl\b/.test(callArgs)) {
          offenders.push(`${rel}: a getDocument() call is missing wasmUrl`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
