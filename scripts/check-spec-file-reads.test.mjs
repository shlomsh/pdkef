import { describe, expect, it } from 'vitest';
import { readTargetsOf, coverageOf, e2eCovers, affectedFrom } from './check-spec-file-reads.mjs';

/* QUAL-41: pins the scanner (readTargetsOf) and the verdict (coverageOf) with synthetic spec text and
   injected oracles, so no nx or git call runs here. */

const TRACKED = new Set([
  'public/sw.js',
  'public/images/redaction-guide/sample.pdf',
  'src/x.txt',
  'src/lib/helper.ts',
  'src/lib/__fixtures__/a.json',
]);
const resolveExisting = (rel) => {
  if (TRACKED.has(rel)) return rel;
  const dir = rel.replace(/\/$/, '');
  return [...TRACKED].some((f) => f.startsWith(`${dir}/`)) ? `${dir}/` : null;
};
const scan = (text, spec = 'src/lib/a.test.ts') => readTargetsOf({ spec, text, resolveExisting });

describe('readTargetsOf', () => {
  it('resolves new URL(rel, import.meta.url) against the spec directory', () => {
    const r = scan("const t = readFileSync(new URL('../x.txt', import.meta.url), 'utf8');");
    expect(r.targets).toEqual(['src/x.txt']);
    expect(r.unresolved).toBe(0);
  });

  it('resolves join(ROOT, ...) with a ROOT constant assigned in the file', () => {
    const r = scan("const ROOT = resolve(__dirname, '../..');\nconst s = readFileSync(join(ROOT, 'public', 'sw.js'));");
    expect(r.targets).toEqual(['public/sw.js']);
  });

  it('resolves cwd-relative literals and process.cwd()', () => {
    const r = scan("readFileSync('public/sw.js'); existsSync(path.join(process.cwd(), 'src', 'x.txt'));");
    expect(r.targets).toEqual(['public/sw.js', 'src/x.txt']);
  });

  it('returns a directory target as a prefix and handles setInputFiles', () => {
    const r = scan("readdirSync(join(__dirname, '__fixtures__'));\nawait input.setInputFiles('public/images/redaction-guide/sample.pdf');");
    expect(r.targets).toEqual(['public/images/redaction-guide/sample.pdf', 'src/lib/__fixtures__/']);
  });

  it('counts a dynamic read as unresolved and never as a target', () => {
    const r = scan('const t = readFileSync(somePath, "utf8");');
    expect(r.targets).toEqual([]);
    expect(r.unresolved).toBe(1);
  });

  it('drops a target the spec also imports, and the spec itself', () => {
    const text = "import { h } from './helper';\nreadFileSync(join(__dirname, 'helper.ts'));\nreadFileSync(join(__dirname, 'a.test.ts'));";
    const r = readTargetsOf({ spec: 'src/lib/a.test.ts', text, resolveExisting: (rel) => (rel === 'src/lib/a.test.ts' ? rel : resolveExisting(rel)) });
    expect(r.targets).toEqual([]);
  });

  it('ignores paths that do not exist in the tree', () => {
    expect(scan("readFileSync(join(__dirname, 'nope.txt'))").targets).toEqual([]);
  });
});

const unit = (spec, target) => ({ spec, target, kind: 'unit' });
const e2e = (spec, target) => ({ spec, target, kind: 'e2e' });
const never = () => ({ all: false, seeds: [], reasons: [] });
const noDocs = () => false;

describe('coverageOf', () => {
  it('fails a unit spec whose read target no rule selects, and lists the pair', () => {
    const r = coverageOf({ pairs: [unit('src/a.test.ts', 'public/sw.js')], selectUnit: never, deriveE2e: null, isDocs: noDocs });
    expect(r.filter((x) => !x.covered).map((x) => [x.spec, x.target, x.kind])).toEqual([['src/a.test.ts', 'public/sw.js', 'unit']]);
  });

  it('passes once seeds include the spec, or the verdict is all', () => {
    const seeded = () => ({ all: false, seeds: ['public/sw.js', 'src/a.test.ts'], reasons: [] });
    const wide = () => ({ all: true, seeds: [], reasons: [] });
    for (const selectUnit of [seeded, wide]) {
      const r = coverageOf({ pairs: [unit('src/a.test.ts', 'public/sw.js')], selectUnit, deriveE2e: null, isDocs: noDocs });
      expect(r[0].covered).toBe(true);
    }
  });

  it('covers e2e pairs by everything or by a directory prefix, and fails otherwise', () => {
    const deriveE2e = (target) => {
      if (target === 'a') return { everything: true, e2e_paths: '' };
      if (target === 'b') return { everything: false, e2e_paths: 'e2e/other/ src/tools/sign/e2e/' };
      return { everything: false, e2e_paths: 'e2e/other/' };
    };
    const spec = 'src/tools/sign/e2e/x.spec.js';
    const r = coverageOf({ pairs: [e2e(spec, 'a'), e2e(spec, 'b'), e2e(spec, 'c')], selectUnit: never, deriveE2e, isDocs: noDocs });
    expect(r.map((x) => x.covered)).toEqual([true, true, false]);
  });

  it('reports a docs-only target as uncovered', () => {
    const r = coverageOf({ pairs: [unit('src/a.test.ts', 'docs/x.md')], selectUnit: () => ({ all: true, seeds: [], reasons: [] }), deriveE2e: null, isDocs: (f) => f.startsWith('docs/') });
    expect(r[0].covered).toBe(false);
    expect(r[0].reason).toMatch(/docs/);
  });
});

describe('e2eCovers', () => {
  it('matches exact files and directory prefixes only', () => {
    expect(e2eCovers({ everything: false, e2e_paths: 'e2e/a.spec.js e2e/sub/' }, 'e2e/a.spec.js')).toBe(true);
    expect(e2eCovers({ everything: false, e2e_paths: 'e2e/a.spec.js e2e/sub/' }, 'e2e/sub/b.spec.js')).toBe(true);
    expect(e2eCovers({ everything: false, e2e_paths: 'e2e/a.spec.js' }, 'e2e/a.spec.jsx')).toBe(false);
  });
});

describe('affectedFrom', () => {
  it('is the project plus its transitive dependents', () => {
    const deps = { site: [{ target: 'lib' }], tool: [{ target: 'lib' }], lib: [{ target: 'data' }], other: [] };
    expect(affectedFrom('data', deps).sort()).toEqual(['data', 'lib', 'site', 'tool']);
  });
});
