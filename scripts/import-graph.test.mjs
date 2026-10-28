import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importGlobPatterns, buildEdges, buildReachGraph, buildToolRouteMap, edgesOfFiles, importSpecifiers, isLocalSpecifier, resolveRelativeImport, reverseEdgeMap } from './import-graph.mjs';

/* scripts/import-graph.mjs is the scan check-module-boundaries.mjs (its own tests are the oracle for
   the main edge scan) and affected-scope.mjs (ARCH-32) share. This pins what only the second one
   needs, on a throwaway tree: test/spec/e2e/api/middleware files are in the reach graph but not in
   the boundary scan, and a root other than this checkout can be scanned. */
const FILES = {
  'src/lib/a.ts': "import { b } from './b.js';\nexport const a = b;\n",
  'src/lib/b.ts': 'export const b = 1;\n',
  'src/lib/a.test.ts': "import { a } from './a.js';\n",
  'src/tools/x/PdfXTool.tsx': "import { a } from '../../lib/a.js';\n",
  'src/tools/x/e2e/x.spec.js': "import { b } from '../../../lib/b.js';\n",
  'src/pages/x.astro': "---\nimport PdfXTool from '../tools/x/PdfXTool.tsx';\n---\n<script src=\"../lib/b.ts\"></script>\n",
  'src/pages/index.astro': '---\n---\n',
  'src/styles/global.css': 'body {}\n',
  'api/report.ts': "import { b } from '../src/lib/b.js';\n",
  'middleware.ts': "import { a } from './src/lib/a.js';\n",
  'e2e/home/h.spec.js': "import { a } from '../../src/lib/a.js';\n",
};
let root;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-graph-'));
  for (const [file, source] of Object.entries(FILES)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), source);
  }
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('buildEdges', () => {
  it('scans src/ without test or spec files, relative to the root it is given', () => {
    const { edges } = buildEdges(root);
    expect(edges).toContainEqual({ from: 'src/lib/a.ts', to: 'src/lib/b.ts' });
    expect(edges.some((e) => e.from.endsWith('.test.ts') || e.from.endsWith('.spec.js'))).toBe(false);
  });
});

describe('buildReachGraph', () => {
  it('includes test and spec files, <script src> edges, e2e/, api/ and middleware.ts', () => {
    const { knownFiles, reverseEdges } = buildReachGraph(root);
    expect([...reverseEdges.get('src/lib/a.ts')].sort()).toEqual([
      'e2e/home/h.spec.js', 'middleware.ts', 'src/lib/a.test.ts', 'src/tools/x/PdfXTool.tsx',
    ]);
    expect([...reverseEdges.get('src/lib/b.ts')].sort()).toEqual([
      'api/report.ts', 'src/lib/a.ts', 'src/pages/x.astro', 'src/tools/x/e2e/x.spec.js',
    ]);
    expect(knownFiles.has('src/pages/index.astro')).toBe(true);
  });

  it('does not know a stylesheet: only source files are nodes', () => {
    expect(buildReachGraph(root).knownFiles.has('src/styles/global.css')).toBe(false);
  });

  it('derives the tool route map from the pages that import a tool island', () => {
    expect([...buildReachGraph(root).routeMap]).toEqual([['/x', 'x']]);
    expect([...buildToolRouteMap(path.join(root, 'src/pages'))]).toEqual([['/x', 'x']]);
  });
});

describe('reverseEdgeMap', () => {
  it('maps each target to the set of files importing it', () => {
    const reverse = reverseEdgeMap([{ from: 'a', to: 'c' }, { from: 'b', to: 'c' }, { from: 'a', to: 'b' }]);
    expect([...reverse.get('c')]).toEqual(['a', 'b']);
    expect([...reverse.get('b')]).toEqual(['a']);
  });
});

/* ARCH-49: the scanner records an edge for every import form it can read and throws for the ones it
   cannot, so a side door never escapes the boundary rules or affected-scope silently. */
describe('importSpecifiers side doors', () => {
  it('reads new URL(<relative literal>, import.meta.url) as a specifier', () => {
    expect(importSpecifiers("const u = new URL('../x/worker.js', import.meta.url);")).toContain('../x/worker.js');
    expect(importSpecifiers('const u = new URL("./w.ts", import.meta.url)')).toContain('./w.ts');
  });
  it('ignores a new URL that is not relative to import.meta.url', () => {
    expect(importSpecifiers("new URL('https://example.com/a', location.href)")).toEqual([]);
  });
  it('throws naming file and line on a template-literal import', () => {
    const source = 'const a = 1;\nconst m = await import(`./locales/${lang}.js`);\n';
    expect(() => importSpecifiers(source, 'src/x.ts')).toThrow('import-graph cannot read a computed import at src/x.ts:2; use a literal specifier');
  });
  it('throws on a non-literal import argument', () => {
    expect(() => importSpecifiers('import(name)', 'src/y.ts')).toThrow(/computed import at src\/y\.ts:1/);
  });
  it('a computed import in a test file is skipped, not thrown', () => {
    const source = "const m = await import(`${x}`);\nconst a = await import('./a.js');\n";
    expect(importSpecifiers(source, 'src/x/foo.test.js')).toEqual(['./a.js']);
    expect(() => importSpecifiers(source, 'src/x/foo.js')).toThrow('computed import at src/x/foo.js:1');
  });
  it('keeps plain string and no-substitution template imports working', () => {
    expect(importSpecifiers("import('./a.js')")).toEqual(['./a.js']);
    expect(importSpecifiers('import(`./a.js`)')).toEqual(['./a.js']);
  });
});

describe('edgesOfFiles side doors', () => {
  let tree;
  beforeAll(() => {
    tree = fs.mkdtempSync(path.join(os.tmpdir(), 'import-graph-doors-'));
    const files = {
      'src/lib/w.ts': 'export {};\n',
      'src/lib/data/one.js': 'export {};\n',
      'src/lib/data/two.js': 'export {};\n',
      'src/lib/data/skip.txt': 'x\n',
      'src/lib/url.ts': "export const u = new URL('./w.ts', import.meta.url);\n",
      'src/lib/glob.ts': "export const m = import.meta.glob('./data/*.js');\n",
      'src/lib/bad.ts': 'export const m = import(`./data/${n}.js`);\n',
    };
    for (const [f, src] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(tree, f)), { recursive: true });
      fs.writeFileSync(path.join(tree, f), src);
    }
  });
  afterAll(() => fs.rmSync(tree, { recursive: true, force: true }));
  const at = (f) => path.join(tree, f);

  it('records an edge for new URL(..., import.meta.url)', () => {
    expect(edgesOfFiles([at('src/lib/url.ts')], tree)).toEqual([{ from: 'src/lib/url.ts', to: 'src/lib/w.ts' }]);
  });
  it('records an edge to every file an import.meta.glob pattern matches', () => {
    const edges = edgesOfFiles([at('src/lib/glob.ts')], tree);
    expect(edges.map((e) => e.to).sort()).toEqual(['src/lib/data/one.js', 'src/lib/data/two.js']);
  });
  it('fails loudly on a computed import', () => {
    expect(() => edgesOfFiles([at('src/lib/bad.ts')], tree)).toThrow(/computed import at src\/lib\/bad\.ts:1/);
  });
});

describe('comment blanking is string-aware', () => {
  it('keeps /** and /* inside a glob string', () => {
    expect(importGlobPatterns("const a = import.meta.glob('./icons/**/*.svg');", 'src/x.js')).toEqual(['./icons/**/*.svg']);
  });
  it('does not start a comment inside a string literal', () => {
    expect(importSpecifiers("const s = '/* not a comment'; import('./a.js'); const t = '*/';")).toEqual(['./a.js']);
  });
  it('still ignores import(x) inside real comments', () => {
    expect(importSpecifiers('/* import(x) */\n// import(y)\nconst a = 1;', 'src/x.js')).toEqual([]);
  });
  it('reads a string import() that carries an options argument', () => {
    expect(importSpecifiers("const m = await import('./data.json', { with: { type: 'json' } });", 'src/x.js')).toContain('./data.json');
    expect(importSpecifiers('const m = await import("./data.json", { with: { type: "json" } });', 'src/x.js')).toContain('./data.json');
  });
  it('returns a plain import() exactly once', () => {
    expect(importSpecifiers("const m = await import('./a.js');", 'src/x.js')).toEqual(['./a.js']);
  });
});

describe('import aliases (ARCH-44)', () => {
  const from = () => path.join(root, 'src/tools/x/PdfXTool.tsx');
  it('resolves an alias to the same file as the relative spelling, with or without a query', () => {
    const rel = resolveRelativeImport(from(), '../../lib/b.ts', root);
    expect(rel).toBe(path.join(root, 'src/lib/b.ts'));
    expect(resolveRelativeImport(from(), '#lib/b.ts', root)).toBe(rel);
    expect(resolveRelativeImport(from(), '#lib/b.ts?url', root)).toBe(rel);
  });
  it('isLocalSpecifier accepts relative, rooted and alias, not bare or unknown #', () => {
    for (const s of ['./a', '../a', '/src/a', '#lib/a.ts', '#shell/a.tsx']) expect(isLocalSpecifier(s)).toBe(true);
    for (const s of ['preact', 'node:fs', '#x/a.ts']) expect(isLocalSpecifier(s)).toBe(false);
  });
  it('edgesOfFiles emits the same edge for an aliased import, and skips an unknown #x/', () => {
    const r = fs.mkdtempSync(path.join(os.tmpdir(), 'import-graph-alias-'));
    try {
      fs.mkdirSync(path.join(r, 'src/lib'), { recursive: true });
      fs.mkdirSync(path.join(r, 'src/tools/x'), { recursive: true });
      fs.writeFileSync(path.join(r, 'src/lib/b.ts'), 'export const b = 1;\n');
      fs.writeFileSync(path.join(r, 'src/tools/x/rel.ts'), "import { b } from '../../lib/b.ts';\n");
      fs.writeFileSync(path.join(r, 'src/tools/x/ali.ts'), "import { b } from '#lib/b.ts';\nimport { z } from '#x/z.ts';\n");
      const edges = edgesOfFiles([path.join(r, 'src/tools/x/rel.ts'), path.join(r, 'src/tools/x/ali.ts')], r);
      expect(edges).toEqual([
        { from: 'src/tools/x/rel.ts', to: 'src/lib/b.ts' },
        { from: 'src/tools/x/ali.ts', to: 'src/lib/b.ts' },
      ]);
    } finally {
      fs.rmSync(r, { recursive: true, force: true });
    }
  });
});
