// Unit coverage for scripts/check-detection-purity.mjs's rule logic, the same
// pattern check-module-boundaries.rules.test.mjs uses: literal source
// fixtures through the guard's own exported pure functions, not a
// reimplementation of them. `checkAll()` at the end is the one test that
// walks the real tree, pinning "today's code passes" the way
// check-editor-dependency-directions.test.mjs pins staleExceptions() against
// literal edges rather than only trusting the CLI run.
import { describe, expect, it } from 'vitest';
import {
  parseModule, checkForbiddenImports, checkForbiddenGlobals, checkModuleLevelState, checkAll,
} from './check-detection-purity.mjs';

const FILE = 'src/editor/adapters/pdf/formGrid.js'; // a real, non-shim entry in DETECTION_MODULES
const SHIM_FILE = 'src/editor/adapters/pdf/pageInk.js'; // a real entry in BOUNDARY_SHIMS

function imports(source, file = FILE) {
  return checkForbiddenImports(parseModule(file, source), file);
}

function globals(source, file = FILE) {
  return checkForbiddenGlobals(parseModule(file, source), file);
}

function state(source, file = FILE) {
  return checkModuleLevelState(parseModule(file, source), file);
}

describe('detection purity guard: forbidden imports (rule 1)', () => {
  it('fails a static import of pdfjs-dist', () => {
    expect(imports("import { getDocument } from 'pdfjs-dist';\n")).toHaveLength(1);
  });

  it('fails a static import of a pdfjs-dist subpath', () => {
    expect(imports("import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';\n")).toHaveLength(1);
  });

  it('fails a static import of @cantoo/pdf-lib', () => {
    expect(imports("import { PDFName } from '@cantoo/pdf-lib';\n")).toHaveLength(1);
  });

  it('fails a static import of preact', () => {
    expect(imports("import { useState } from 'preact/hooks';\n")).toHaveLength(1);
  });

  it('fails a dynamic import() of a forbidden package, wherever it appears', () => {
    const source = 'export async function f() {\n  const lib = await import(\'@cantoo/pdf-lib\');\n  return lib;\n}\n';
    expect(imports(source)).toHaveLength(1);
  });

  it('does not flag a JSDoc @param type reference to a forbidden package', () => {
    // This is the exact shape pageInk.js, formGrid.js, formCells.js,
    // formWidgets.js and pdfObjects.js all carry today - a text/regex scan
    // over raw source reads `import('@cantoo/pdf-lib')` here as a real
    // dynamic import; the AST does not, because a comment is not a node.
    const source = "/**\n * @param {import('@cantoo/pdf-lib').PDFPage} page\n */\nexport function f(page) { return page; }\n";
    expect(imports(source)).toEqual([]);
  });

  it('allows an ordinary relative or bare-package import', () => {
    const source = "import { collectPageInk } from './pageInk.js';\nimport { z } from 'zod';\n";
    expect(imports(source)).toEqual([]);
  });

  it('exempts a file on the boundary-shim allowlist from the package check', () => {
    expect(imports("import { PDFName } from '@cantoo/pdf-lib';\n", SHIM_FILE)).toEqual([]);
  });
});

describe('detection purity guard: forbidden globals (rule 1, DOM half, and rule 3)', () => {
  it('fails document.<member>', () => {
    expect(globals('export const id = document.title;\n')).toHaveLength(1);
  });

  it('fails window.<member>', () => {
    expect(globals('export const w = window.innerWidth;\n')).toHaveLength(1);
  });

  it('fails navigator.<member>', () => {
    expect(globals('export const ua = navigator.userAgent;\n')).toHaveLength(1);
  });

  it('fails a bare localStorage reference', () => {
    expect(globals('export const has = typeof localStorage !== "undefined";\n')).toHaveLength(1);
  });

  it('fails a bare XMLHttpRequest reference', () => {
    expect(globals('export const X = XMLHttpRequest;\n')).toHaveLength(1);
  });

  it('fails a fetch(...) call', () => {
    expect(globals('export async function f() { return fetch("/x"); }\n')).toHaveLength(1);
  });

  it('fails new Date()', () => {
    expect(globals('export const now = new Date();\n')).toHaveLength(1);
  });

  it('fails Date.now()', () => {
    expect(globals('export const now = Date.now();\n')).toHaveLength(1);
  });

  it('fails Math.random()', () => {
    expect(globals('export const r = Math.random();\n')).toHaveLength(1);
  });

  it('fails performance.now()', () => {
    expect(globals('export const t = performance.now();\n')).toHaveLength(1);
  });

  it('allows ordinary Math arithmetic', () => {
    const source = 'export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.abs(v)));\n';
    expect(globals(source)).toEqual([]);
  });

  it('does not flag a parameter, object key or property named localStorage', () => {
    // Matched by name, not by resolved binding (documented limit, same as
    // isMutatingUse below): a *shadowing* local read would still be flagged,
    // which is the safe direction for a purity guard to be wrong in, and no
    // module in DETECTION_MODULES shadows a forbidden global today.
    const source = 'function f(localStorage) {}\nconst obj = { localStorage: 1 };\nexport const v = obj.localStorage;\n';
    expect(globals(source)).toEqual([]);
  });

  it('is not exempted by the boundary-shim allowlist', () => {
    expect(globals('export const id = document.title;\n', SHIM_FILE)).toHaveLength(1);
  });
});

describe('detection purity guard: module-level mutable state (rule 2)', () => {
  it('fails a top-level let', () => {
    expect(state('let cache = new Map();\n')).toHaveLength(1);
  });

  it('fails a top-level var', () => {
    expect(state('var count = 0;\n')).toHaveLength(1);
  });

  it('fails a top-level const Map that is later .set()', () => {
    const source = 'const cache = new Map();\nexport function remember(k, v) { cache.set(k, v); }\n';
    expect(state(source)).toHaveLength(1);
  });

  it('fails a top-level const array that is later .push()ed', () => {
    const source = 'const seen = [];\nexport function note(x) { seen.push(x); }\n';
    expect(state(source)).toHaveLength(1);
  });

  it('fails a top-level const object that is later assigned a new property', () => {
    const source = 'const memo = {};\nexport function put(k, v) { memo[k] = v; }\n';
    expect(state(source)).toHaveLength(1);
  });

  it('allows a top-level const Set that is only ever read', () => {
    const source = "const FILL_OPERATORS = new Set(['f', 'F']);\nexport const isFill = (op) => FILL_OPERATORS.has(op);\n";
    expect(state(source)).toEqual([]);
  });

  it('allows a top-level const array literal that is only ever read', () => {
    const source = 'const IDENTITY = [1, 0, 0, 1, 0, 0];\nexport function base() { return IDENTITY[0]; }\n';
    expect(state(source)).toEqual([]);
  });

  it('allows a top-level const object literal that is only ever read', () => {
    const source = "const KINDS = { comb: 'comb', text: 'text' };\nexport const kindOf = (k) => KINDS[k];\n";
    expect(state(source)).toEqual([]);
  });

  it('allows a top-level const scalar or function', () => {
    const source = 'const IOU = 0.5;\nconst pct = (n, d) => (d > 0 ? (n / d) * 100 : null);\n';
    expect(state(source)).toEqual([]);
  });

  it('ignores a function-local let/const container - only top-level state counts', () => {
    const source = 'export function walk(tokens) {\n  let depth = 0;\n  const found = [];\n  for (const t of tokens) { if (t) depth += 1; found.push(t); }\n  return { depth, found };\n}\n';
    expect(state(source)).toEqual([]);
  });
});

describe('detection purity guard: the real tree', () => {
  it('passes every module in DETECTION_MODULES with zero violations today', () => {
    const { violations, missing } = checkAll();
    expect(missing).toEqual([]);
    expect(violations).toEqual([]);
  });
});
