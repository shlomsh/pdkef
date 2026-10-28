import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { findAliasViolations } from './check-import-aliases.mjs';

// Fake world: resolveRel maps a relative specifier from `from` to a repo path, exists checks a set.
const FILES = new Set([
  'src/lib/text/sort.ts',
  'src/lib/pdf/open.ts',
  'src/lib/pdf/other.ts',
  'src/editor/model.ts',
  'src/editor-ui/Bar.tsx',
  'src/shell/Base.tsx',
  'src/tools/sign/a.ts',
]);
const run = (from, specs) =>
  findAliasViolations(from, specs, {
    resolveRel: (s) => (s.startsWith('.') ? path.posix.join(path.posix.dirname(from), s) : null),
    exists: (p) => FILES.has(p),
  });
const reasons = (from, specs) => run(from, specs).map((v) => v.reason);

describe('findAliasViolations', () => {
  it('flags a relative import into another layer', () => {
    const v = run('src/tools/sign/a.ts', ['../../lib/text/sort.ts']);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ file: 'src/tools/sign/a.ts', specifier: '../../lib/text/sort.ts' });
    expect(v[0].reason).toMatch(/use the alias/);
  });
  it('keeps editor and editor-ui apart', () => {
    expect(run('src/editor-ui/Bar.tsx', ['../editor/model.ts'])).toHaveLength(1);
    expect(run('src/editor/model.ts', ['../editor-ui/Bar.tsx'])).toHaveLength(1);
    expect(run('src/editor-ui/Bar.tsx', ['#editor/model.ts'])).toEqual([]);
    expect(run('src/editor-ui/Bar.tsx', ['#editor-ui/Bar.tsx'])).toHaveLength(1);
  });
  it('flags an alias into the importer own layer', () => {
    expect(reasons('src/lib/pdf/open.ts', ['#lib/pdf/other.ts'])).toEqual([expect.stringMatching(/relative/)]);
  });
  it('flags an alias whose file does not exist (missing extension)', () => {
    expect(reasons('src/tools/sign/a.ts', ['#lib/text/sort'])).toEqual([expect.stringMatching(/extension/)]);
  });
  it('flags a relative climb of four or more folders', () => {
    expect(reasons('src/tools/sign/deep/x/y/a.ts', ['../../../../z.ts'])).toEqual([expect.stringMatching(/four/)]);
  });
  it('passes a within-layer relative import and a correct alias', () => {
    expect(run('src/lib/pdf/open.ts', ['./other.ts', '../text/sort.ts'])).toEqual([]);
    expect(run('src/tools/sign/a.ts', ['#lib/text/sort.ts', '#editor/model.ts'])).toEqual([]);
  });
  it('exempts ? queries, e2e importers and bare packages', () => {
    expect(run('src/tools/sign/a.ts', ['../../lib/text/sort.ts?raw', 'pdf-lib', 'preact/hooks'])).toEqual([]);
    expect(run('src/tools/sign/e2e/a.spec.ts', ['../../../lib/text/sort.ts', '#lib/nope'])).toEqual([]);
  });
});
