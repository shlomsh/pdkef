import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vercel compiles each file under api/ on its own and keeps import paths as
// written, so a `./x.ts` specifier anywhere a function reaches passes every
// local check and fails every request in production (DEBT-17 found it with
// `vercel build`). Type-only imports are erased and do not count.

const ROOT = resolve(__dirname, '../..');
const RUNTIME_IMPORT = /^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"](\.[^'"]+)['"]/gm;

function runtimeImports(file) {
  return [...readFileSync(file, 'utf8').matchAll(RUNTIME_IMPORT)].map((m) => m[1]);
}

function reachable(entry, seen = new Set()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  for (const spec of runtimeImports(entry)) {
    const target = resolve(dirname(entry), spec.replace(/\.js$/, '.ts'));
    reachable(target, seen);
  }
  return seen;
}

describe('files a Vercel function loads', () => {
  const entries = readdirSync(join(ROOT, 'api'))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(ROOT, 'api', name));

  it('finds the functions', () => expect(entries.length).toBeGreaterThan(0));

  for (const entry of entries) {
    it(`${entry.slice(ROOT.length + 1)} reaches no runtime import ending in .ts`, () => {
      const offenders = [...reachable(entry)].flatMap((file) =>
        runtimeImports(file)
          .filter((spec) => spec.endsWith('.ts'))
          .map((spec) => `${file.slice(ROOT.length + 1)} imports ${spec}`),
      );
      expect(offenders).toEqual([]);
    });
  }
});
