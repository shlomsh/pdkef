import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fileKind from './fileKind.js';

const toolsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tools');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

describe('isPdfFile', () => {
  it('accepts a .pdf the browser reports with no type', () => {
    expect(fileKind.isPdfFile(new File([], 'x.pdf', { type: '' }))).toBe(true);
    expect(fileKind.isPdfFile(new File([], 'x.pdf', { type: 'application/pdf' }))).toBe(true);
  });

  it('rejects files that are not PDFs', () => {
    expect(fileKind.isPdfFile(new File([], 'x.txt', { type: '' }))).toBe(false);
    expect(fileKind.isPdfFile(new File([], 'x.png', { type: 'image/png' }))).toBe(false);
  });
});

describe('tool intake', () => {
  it('no tool decides "is this a PDF" by comparing file.type itself', () => {
    const offenders = [];
    for (const file of walk(toolsRoot)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/type\s*[!=]==\s*'application\/pdf'/.test(line)) {
          offenders.push(`${path.relative(toolsRoot, file)}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
