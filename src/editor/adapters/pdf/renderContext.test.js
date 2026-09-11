import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPdfRenderContext } from './renderContext.js';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

describe('getPdfRenderContext', () => {
  it('forces ltr on the context so pdf.js glyph placement ignores the page direction', () => {
    const context = { direction: 'inherit' };
    const canvas = { getContext: (kind) => (kind === '2d' ? context : null) };
    expect(getPdfRenderContext(canvas)).toBe(context);
    expect(context.direction).toBe('ltr');
  });

  it('passes through a null context rather than throwing', () => {
    expect(getPdfRenderContext({ getContext: () => null })).toBeNull();
  });

  // Every pdf.js `page.render(...)` in src/ must take its context from this
  // helper. A raw getContext('2d') in the same module is the regression
  // that made /he/sign/ tear Hebrew (and Latin) glyphs apart.
  it('every pdf.js render call site hands over a context made by the helper', () => {
    const offenders = [];
    for (const file of walk(srcRoot)) {
      const source = fs.readFileSync(file, 'utf8');
      if (!/\.render\(\s*(\{\s*canvas(Context)?\b|renderContext)/.test(source)) continue;
      const rel = path.relative(srcRoot, file);
      if (/\.render\(\s*\{\s*canvas\s*[,}]/.test(source)) {
        offenders.push(`${rel}: passes { canvas } and lets pdf.js create the context`);
      }
      const bound = [...source.matchAll(/canvasContext:\s*(\w+)/g)].map((match) => match[1]);
      if (bound.length === 0) offenders.push(`${rel}: no canvasContext handed to page.render`);
      for (const name of bound) {
        if (!new RegExp(`(const|let)\\s+${name}\\s*=\\s*getPdfRenderContext\\(`).test(source)) {
          offenders.push(`${rel}: canvasContext "${name}" is not from getPdfRenderContext`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
