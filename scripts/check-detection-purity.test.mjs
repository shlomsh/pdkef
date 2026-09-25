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
const PDFOBJECTS_FILE = 'src/editor/adapters/pdf/pdfObjects.js'; // a shim with several FUNCTION_SHIMS entries
const SCORE_FILE = 'src/editor/adapters/pdf/corpus/scoring/score.js'; // a shim whose entry point dynamically imports

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

// The five gaps below are from an independent review of commit b8750b02:
// each fixture reproduces one finding and, run against that commit's own
// copy of scripts/check-detection-purity.mjs, either goes uncaught (a
// missed violation) or gets wrongly flagged (a false positive on a
// shadowed local) - confirmed by hand, side by side against a checkout of
// b8750b02, before writing the fix.
describe('detection purity guard: forbidden globals - full reference coverage (rule 1b, review finding 1)', () => {
  it('fails globalThis.document.title', () => {
    expect(globals('export const t = globalThis.document.title;\n')).toHaveLength(1);
  });

  it('fails self.document.title', () => {
    expect(globals('export const t = self.document.title;\n')).toHaveLength(1);
  });

  it('fails a bare self reference', () => {
    expect(globals('export function f() { return self; }\n')).toHaveLength(1);
  });

  it('fails destructuring document off globalThis, even though "document" itself is only a property key', () => {
    expect(globals('const { document: doc } = globalThis;\nexport const t = doc;\n')).toHaveLength(1);
  });

  it('does not flag a reference to a shadowing PARAMETER used in the function body', () => {
    // The old FORBIDDEN_PROPERTY_ACCESS map matched only the bare object
    // name, so a body reference to a shadowed parameter was never actually
    // exercised by a passing test - only the declaration site was (the
    // "parameter, object key or property named localStorage" case above),
    // and a declaration site is excluded by isBindingPosition regardless of
    // scope resolution. A real body *use* of the shadowed name needs
    // createChecker's scope resolution, not a name-only match, to stay
    // unflagged.
    expect(globals('export function f(document) { return document.title; }\n')).toEqual([]);
  });
});

describe('detection purity guard: nondeterministic crypto (rule 3, review finding 2)', () => {
  it('fails crypto.randomUUID()', () => {
    expect(globals('export const id = crypto.randomUUID();\n')).toHaveLength(1);
  });

  it('fails crypto.getRandomValues()', () => {
    expect(globals('export const buf = crypto.getRandomValues(new Uint8Array(4));\n')).toHaveLength(1);
  });

  it('still allows an unrelated crypto member', () => {
    expect(globals('export const alg = crypto.subtle;\n')).toEqual([]);
  });
});

describe('detection purity guard: scope-resolved mutation (rule 2, review finding 3)', () => {
  it('does not flag a top-level const when only a same-named SHADOWED LOCAL is mutated', () => {
    // This exact shape (a top-level readonly const like KIND_GROUPS, and a
    // same-named local built and mutated inside a function) is real in
    // formGrid.js today; the old name-only isMutatingUse would have flagged
    // formGrid.js's own top-level KIND_GROUPS the moment a function ever
    // declared a local of the same name.
    const source = 'const cache = new Map();\n'
      + 'export function f() {\n'
      + '  const cache = new Map();\n'
      + '  cache.set(1, 2);\n'
      + '  return cache;\n'
      + '}\n';
    expect(state(source)).toEqual([]);
  });

  it('does not flag a top-level const when only a same-named PARAMETER is mutated', () => {
    const source = 'const cache = new Map();\nexport function f(cache) { cache.set(1, 2); }\n';
    expect(state(source)).toEqual([]);
  });

  it('still flags the real top-level mutation when nothing shadows the name', () => {
    const source = 'const cache = new Map();\nexport function remember(k, v) { cache.set(k, v); }\n';
    expect(state(source)).toHaveLength(1);
  });
});

describe('detection purity guard: per-function shim allowlist (rule 1, review finding 4)', () => {
  it('allows a reference to an imported pdf-lib binding inside an allowlisted function', () => {
    const source = "import { PDFName } from '@cantoo/pdf-lib';\n"
      + 'export function lookupDict(context, value) {\n'
      + '  return PDFName.of("x");\n'
      + '}\n';
    expect(imports(source, PDFOBJECTS_FILE)).toEqual([]);
  });

  it('fails a reference to an imported pdf-lib binding inside a function NOT on the allowlist', () => {
    // Same shape as the file's real lookupDict, under a name FUNCTION_SHIMS
    // does not list - the exact "exempted per file, not per function" gap
    // the review found: lookupDict, numberAt, getPageContentBytes,
    // extractPageObjects and hasFillableAcroForm were all getting pdf-lib
    // for free off the old whole-file exemption before this fix.
    const source = "import { PDFName } from '@cantoo/pdf-lib';\n"
      + 'export function notAShim(context, value) {\n'
      + '  return PDFName.of("x");\n'
      + '}\n';
    expect(imports(source, PDFOBJECTS_FILE)).toHaveLength(1);
  });

  it('fails a reference at true module scope, outside any function', () => {
    const source = "import { PDFName } from '@cantoo/pdf-lib';\nexport const KEY = PDFName.of('x');\n";
    expect(imports(source, PDFOBJECTS_FILE)).toHaveLength(1);
  });

  it('fails a dynamic import() inside a function not on the file allowlist, even in a shim file', () => {
    const source = 'export async function notAShim() {\n'
      + "  return import('pdfjs-dist/legacy/build/pdf.mjs');\n"
      + '}\n';
    expect(imports(source, SCORE_FILE)).toHaveLength(1);
  });

  it('allows the same dynamic import() inside its real allowlisted function', () => {
    const source = 'export async function pageTextRuns() {\n'
      + "  return import('pdfjs-dist/legacy/build/pdf.mjs');\n"
      + '}\n';
    expect(imports(source, SCORE_FILE)).toEqual([]);
  });
});

describe('detection purity guard: bare require(...) (rule 1, review finding 5)', () => {
  it('fails a bare require of a forbidden package in a non-shim file', () => {
    expect(imports("const lib = require('@cantoo/pdf-lib');\n")).toHaveLength(1);
  });

  it('fails require(...) of a forbidden package outside the allowlisted function, even in a shim file', () => {
    const source = "export function notAShim() { return require('pdfjs-dist'); }\n";
    expect(imports(source, SCORE_FILE)).toHaveLength(1);
  });

  it('does not flag require.resolve(...) of a forbidden package path', () => {
    // score.js's real pageTextRuns does exactly this
    // (require.resolve('pdfjs-dist/package.json')) to locate the font/cmap/
    // wasm directories on disk - it resolves a path, it never loads the
    // module, and is not the bare `require(...)` call this rule is about.
    expect(imports("const p = require.resolve('pdfjs-dist/package.json');\n")).toEqual([]);
  });
});

describe('detection purity guard: the real tree', () => {
  it('passes every module in DETECTION_MODULES with zero violations today', () => {
    const { violations, missing } = checkAll();
    expect(missing).toEqual([]);
    expect(violations).toEqual([]);
  });
});
