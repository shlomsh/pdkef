import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  collectSourceFiles, importSpecifiers,
} from './check-module-boundaries.mjs';

// Straight from node_modules, past Vite: typescript.js is a 9 MB CommonJS
// bundle with a source-map comment pointing at a file npm does not ship, and
// letting Vite transform it just prints an ENOENT for that map on every run.
const ts = createRequire(import.meta.url)('typescript');

// scripts/check-module-boundaries.mjs reads the import graph with a regex, not
// a parser. That regex once stopped at a line break, so every
// `import {\n ... \n} from '...'` was invisible to it (29 edges, found only by
// diffing against Nx's AST-built graph during the ARCH-20 prep). This test is
// that diff, kept: TypeScript's own parser walks the same files, and every
// relative specifier it finds must also come out of the regex. The regex is
// allowed to find more (a `<script>` below an .astro frontmatter, a JSDoc
// `import('...')` type), since an extra edge only ever makes the check stricter.
//
// The shape table below pins the statement forms the regex must read, so a
// future edit to IMPORT_PATTERN cannot quietly drop one of them without a
// matching file in src/ happening to exist at the time.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

const isRelative = (s) => s.startsWith('.') || s.startsWith('/');

function astSpecifiers(file, source) {
  let code = source;
  if (file.endsWith('.astro')) {
    // Only the frontmatter fence is TypeScript; the template is not parsed.
    const fence = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    code = fence ? fence[1] : '';
  }
  const kind = /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, kind);
  const out = new Set();
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.add(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      out.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

describe('module boundary import scan', () => {
  it('reads every statement shape the AST does', () => {
    const cases = [
      ["import { a } from './x.js';", './x.js'],
      ["import {\n  a, b,\n  c,\n} from './multi.js';", './multi.js'],
      ["import type { A } from './t.js';", './t.js'],
      ["import { type A, b } from './inline-type.js';", './inline-type.js'],
      ["import d from './default.js';", './default.js'],
      ["import d, { a } from './default-named.js';", './default-named.js'],
      ["import d, {\n  a,\n} from './default-multi.js';", './default-multi.js'],
      ["import * as ns from './ns.js';", './ns.js'],
      ["import d, * as ns from './default-ns.js';", './default-ns.js'],
      ["import './side-effect.js';", './side-effect.js'],
      ["const m = await import('./dynamic.js');", './dynamic.js'],
      ["export { a } from './re.js';", './re.js'],
      ["export {\n  a,\n  b,\n} from './re-multi.js';", './re-multi.js'],
      ["export * from './star.js';", './star.js'],
      ["export * as ns from './star-ns.js';", './star-ns.js'],
      ["export type { A } from './re-type.js';", './re-type.js'],
      ['import { a } from "./double.js";', './double.js'],
      ["  import { a } from './indented.js'", './indented.js'],
    ];
    for (const [statement, specifier] of cases) {
      expect(importSpecifiers(statement), statement).toContain(specifier);
    }
  });

  it('finds every relative specifier TypeScript finds, in every source file', () => {
    const missed = [];
    let astCount = 0;
    for (const file of collectSourceFiles(SRC)) {
      const source = fs.readFileSync(file, 'utf8');
      const fromRegex = new Set(importSpecifiers(source));
      for (const specifier of astSpecifiers(file, source)) {
        if (!isRelative(specifier)) continue;
        astCount += 1;
        if (!fromRegex.has(specifier)) missed.push(`${path.relative(ROOT, file)}: ${specifier}`);
      }
    }
    expect(missed).toEqual([]);
    // A parse that silently returned nothing would pass the assertion above
    // for free; the graph has several hundred relative edges today.
    expect(astCount).toBeGreaterThan(500);
  });
});
