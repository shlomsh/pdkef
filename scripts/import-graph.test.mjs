import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildEdges, buildReachGraph, buildToolRouteMap, reverseEdgeMap } from './import-graph.mjs';

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
