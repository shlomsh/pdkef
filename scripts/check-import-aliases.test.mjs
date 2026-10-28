import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { findAliasViolations, specifiersOf } from './check-import-aliases.mjs';

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
  it('lets a test file climb to shared test support (the climb limit is for non-test imports)', () => {
    expect(run('src/tools/sign/components/nodes/TextNode.test.tsx', ['../../../../test/support/fixtures/wysiwygStrings.js'])).toEqual([]);
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

describe('specifiersOf', () => {
  it('collects every vi mock-family call, generic ones included', () => {
    const source = [
      "vi.mock('../a.ts');",
      "vi.doMock('../b.ts', () => ({}));",
      "vi.unmock('../c.ts');",
      "vi.doUnmock('../d.ts');",
      "await vi.importActual<{ f: typeof f }>('../e.ts');",
      "await vi.importMock('../f.ts');",
    ].join('\n');
    expect(specifiersOf(source, 'src/x.test.ts').sort()).toEqual(['../a.ts', '../b.ts', '../c.ts', '../d.ts', '../e.ts', '../f.ts']);
  });

  it('leaves out a new URL(..., import.meta.url) argument, which an alias cannot replace', () => {
    const source = "import a from '../a.ts';\nconst w = new URL('../../lib/pdf/pdfjsWorker.js', import.meta.url);\n";
    expect(specifiersOf(source, 'src/x.ts')).toEqual(['../a.ts']);
  });
});
