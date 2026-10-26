// ARCH-39 guards: one pdf.js loader, no hand-written AbortError, no cross-realm-unsafe
// `instanceof ArrayBuffer`. Source-grep style, like pdfjsWasm.test.js.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (file) => path.relative(srcRoot, file).split(path.sep).join('/');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) && !/test-helper/.test(entry.name)) out.push(full);
  }
  return out;
}

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// Files that still carry an offence and belong to the island pass (ARCH-39 follow-up).
// The follow-up empties these lists; nothing may be added.
const FENCED_ABORT_ERROR = ['tools/scan/PdfScanTool.tsx'];
const FENCED_PDFJS_LOADER = [];

function offenders(pattern, { allowed = [] } = {}) {
  return walk(srcRoot)
    .filter((file) => !/\/e2e\//.test(file) && !rel(file).includes('/corpus/'))
    .filter((file) => pattern.test(stripComments(fs.readFileSync(file, 'utf8'))))
    .map(rel)
    .filter((file) => !allowed.includes(file))
    .sort();
}

describe('one set of PDF primitives (ARCH-39)', () => {
  it('imports pdfjs-dist in exactly one module (lib/loadPdfjs.js)', () => {
    const found = offenders(/(?<!typeof )import\(\s*['"]pdfjs-dist['"]\s*\)/, {
      allowed: ['lib/loadPdfjs.js', ...FENCED_PDFJS_LOADER],
    });
    expect(found).toEqual([]);
  });

  it('declares no second getPdfjs memo', () => {
    const found = offenders(/function getPdfjs\b|(?:const|let) getPdfjs\b/, {
      allowed: ['lib/loadPdfjs.js', ...FENCED_PDFJS_LOADER],
    });
    expect(found).toEqual([]);
  });

  it('builds no AbortError by hand (use signal.throwIfAborted() or lib/abort.js)', () => {
    const found = offenders(/new DOMException\([^)]*['"]AbortError['"]|\.name\s*=\s*['"]AbortError['"]/, {
      allowed: ['lib/abort.js', ...FENCED_ABORT_ERROR],
    });
    expect(found).toEqual([]);
  });

  it('never tests bytes with `instanceof ArrayBuffer` (use lib/toBytes.js)', () => {
    expect(offenders(/instanceof ArrayBuffer/)).toEqual([]);
  });
});
