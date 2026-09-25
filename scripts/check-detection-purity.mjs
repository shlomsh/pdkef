// FORM-22: keeps field detection pure - plain data in, plain data out, with
// every pdf-lib/pdf.js/DOM/time/random touch confined to a few named
// boundary shims. Style follows scripts/check-gesture-golden-rule.js (a
// small, targeted static guard, not a general linter), but this one parses
// with the TypeScript compiler API instead of scanning raw text.
//
// That is a deliberate departure from check-module-boundaries.mjs's own
// import scan, and the reason is concrete, not aesthetic: every detector
// file's JSDoc is full of `@param {import('@cantoo/pdf-lib').PDFPage} page`
// type references (pageInk.js, formGrid.js, formCells.js, formWidgets.js,
// pdfObjects.js all carry several), and a text-based `import\s*\(\s*['"]...`
// scan cannot tell that comment text from a real dynamic import - it would
// flag every one of those files as importing pdf-lib at the module level,
// which is exactly the false alarm this guard exists to never raise. An AST
// only sees code; comments are not nodes in it. `typescript` is already a
// devDependency (used the same way, for the same reason, by
// scripts/check-module-boundaries.import-scan.test.mjs, whose own comment on
// the `createRequire` line below is the reference for why plain `import ts
// from 'typescript'` breaks under Vite/Vitest).
//
// Rules (backlog/tasks/FORM-22.md):
//   1. No import of pdfjs-dist, @cantoo/pdf-lib or preact, and no reference to
//      a DOM global (document./window./navigator./localStorage/fetch(/
//      XMLHttpRequest), in a detection module - except a file on the
//      BOUNDARY_SHIMS allowlist below, which is exempt from the
//      package-import half of this rule only (a shim still may not touch the
//      DOM; nothing here needs to).
//   2. No module-level mutable state: a top-level `let`/`var` is a violation
//      outright; a top-level `const` bound to `new Map/Set/WeakMap/Array`, an
//      array literal or an object literal is a violation only if something
//      later in the file mutates it (a lookup table that is only ever read -
//      `.has()`, indexed, spread - is not state).
//   3. No `Date.now()`, `new Date()`, `Math.random()` or `performance.now()`
//      anywhere in a detection module.
//
// Measured on today's code (2026-09-25): 0 violations across all ten scanned
// modules, in well under a second - see the "Landed" note in
// backlog/tasks/FORM-22.md for the run and its sabotage-check results.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Straight from node_modules, past Vite: typescript.js is a 9 MB CommonJS
// bundle with a source-map comment pointing at a file npm does not ship, and
// letting Vite transform it just prints an ENOENT for that map on every run.
// (Same line, same reason, as scripts/check-module-boundaries.import-scan.test.mjs;
// this script needs it unguarded rather than only in a test, since the rules
// themselves are AST-based, not just their cross-check.)
const ts = createRequire(import.meta.url)('typescript');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// The detection modules, and the boundary shims allowed to touch a pdf-lib
// page or pdf.js directly.
//
// Today's field detection is scattered inside src/editor/adapters/pdf/
// alongside unrelated edit/export code (sign.js, redact.js,
// applyPageEdits.js, deleteObjects.js, fieldLabels.js, deleteObjects.js and
// the corpus's own document builders are NOT detection and are deliberately
// left off this list), so this is an explicit file list rather than a
// directory walk. ARCH-24 (backlog/tasks/ARCH-24.md) moves the capability and
// its corpus into one folder under src/tools/sign/ - once that lands, this
// constant collapses to that folder's contents plus DETECTION_ENTRY_POINT
// below, a one-line change rather than a rewrite of this script.
export const DETECTION_MODULES = [
  'src/editor/adapters/pdf/pageInk.js',
  'src/editor/adapters/pdf/formGrid.js',
  'src/editor/adapters/pdf/formCells.js',
  'src/editor/adapters/pdf/formWidgets.js',
  'src/editor/adapters/pdf/fieldRegions.js',
  'src/editor/adapters/pdf/textRuns.js',
  'src/editor/adapters/pdf/pdfObjects.js',
  'src/editor/adapters/pdf/corpus/scoring/score.js',
  'src/editor/adapters/pdf/corpus/scoring/match.js',
  'src/editor/adapters/pdf/corpus/scoring/candidates.js',
];

// ARCH-24's one entry point (`detectFormFields(document, { textRuns, sources? })`).
// Scanned only once it exists, so this guard covers it from the day it lands
// with no second change, and never fails for a file ARCH-24 has not written
// yet.
export const DETECTION_ENTRY_POINT = 'src/editor/adapters/pdf/detectFormFields.ts';

// A shim is a whole file, not a named export within it: pdfObjects.js and
// pageInk.js each mix a handful of page-reading functions with plain
// geometry/parsing helpers in the same file, and splitting either just to
// import a package in half of it would be churn ARCH-24 is about to redo
// anyway when it draws the real folder boundary. Exempting the whole file
// from rule 1's package-import check is the honest version of that, not a
// loophole: every other rule (module-level state, Date/Math/performance)
// still applies to a shim in full, and DOM globals are never allowed even
// here - see the header comment.
export const BOUNDARY_SHIMS = new Map([
  [
    'src/editor/adapters/pdf/pageInk.js',
    'collectPageInk/pageCropBox adapt one pdf-lib PDFPage into plain ink data (MOBI-03).',
  ],
  [
    'src/editor/adapters/pdf/pdfObjects.js',
    'pageWidgets/widgetEntries/collectCheckboxGlyphs read a pdf-lib page and its '
      + 'annotation tree into plain values (FORM-14, MOBI-11).',
  ],
  [
    'src/editor/adapters/pdf/corpus/scoring/score.js',
    'the scoring loader: pageTextRuns opens a real PDF through pdf-lib and pdfjs-dist '
      + 'to score the shipped pipeline against reviewed ground truth (MOBI-13).',
  ],
]);

const FORBIDDEN_PACKAGES = ['pdfjs-dist', '@cantoo/pdf-lib', 'preact'];

function isForbiddenPackage(specifier) {
  return FORBIDDEN_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`));
}

// Property-access forms that reach outside a detector's plain-data inputs.
// `null` means every property on that object is forbidden (there is no
// legitimate reason a pure geometry/annotation reader touches `document` or
// `window` at all); a Set narrows to the specific nondeterministic member -
// `Math.min`/`Math.abs`/`Math.round` etc. are ordinary pure arithmetic this
// codebase uses constantly and must stay allowed.
const FORBIDDEN_PROPERTY_ACCESS = new Map([
  ['document', null],
  ['window', null],
  ['navigator', null],
  ['Math', new Set(['random'])],
  ['Date', new Set(['now'])],
  ['performance', new Set(['now'])],
]);

const FORBIDDEN_BARE_GLOBALS = new Set(['localStorage', 'XMLHttpRequest']);

const MUTATING_METHODS = new Set([
  'set', 'add', 'delete', 'clear', 'push', 'pop', 'shift', 'unshift',
  'splice', 'sort', 'reverse', 'fill', 'copyWithin',
]);

const ASSIGNMENT_OPERATORS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
]);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseModule(relPath, text) {
  const scriptKind = relPath.endsWith('.ts') || relPath.endsWith('.tsx') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  return ts.createSourceFile(path.join(ROOT, relPath), text, ts.ScriptTarget.Latest, true, scriptKind);
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function forEachNode(root, visit) {
  const walk = (node) => {
    visit(node);
    ts.forEachChild(node, walk);
  };
  walk(root);
}

// ---------------------------------------------------------------------------
// Rule 1: forbidden imports + DOM globals
// ---------------------------------------------------------------------------

export function checkForbiddenImports(sourceFile, relPath) {
  const violations = [];
  const exempt = BOUNDARY_SHIMS.has(relPath);

  const report = (node, specifier) => {
    if (exempt) return;
    violations.push(`${relPath}:${lineOf(sourceFile, node)}: imports '${specifier}', which is not on the boundary-shim allowlist`);
  };

  // Static `import`/`export ... from` declarations only ever appear at the
  // module's top level, per the language grammar.
  for (const statement of sourceFile.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
      && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      if (isForbiddenPackage(specifier)) report(statement, specifier);
    }
  }

  // A dynamic `import(...)` call can appear anywhere in the file.
  forEachNode(sourceFile, (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteralLike(arg) && isForbiddenPackage(arg.text)) report(node, arg.text);
    }
  });

  return violations;
}

export function checkForbiddenGlobals(sourceFile, relPath) {
  const violations = [];
  const report = (node, message) => violations.push(`${relPath}:${lineOf(sourceFile, node)}: ${message}`);

  forEachNode(sourceFile, (node) => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date') {
      report(node, "'new Date()' is nondeterministic; a detector must be pure");
      return;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'fetch') {
      report(node, "'fetch(...)' reaches off-device; a detector reads only its own inputs");
      return;
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const objectName = node.expression.text;
      if (FORBIDDEN_PROPERTY_ACCESS.has(objectName)) {
        const onlyMembers = FORBIDDEN_PROPERTY_ACCESS.get(objectName);
        if (onlyMembers === null || onlyMembers.has(node.name.text)) {
          report(node, `'${objectName}.${node.name.text}' reaches outside the detector's plain-data inputs`);
        }
      }
      return;
    }
    // A bare reference, e.g. `typeof localStorage`. Excludes a name used as a
    // *binding* (a declared local, a parameter, an object-literal key, an
    // import specifier) or as the property name in `a.localStorage` - either
    // is a different thing than the global, and `FORBIDDEN_PROPERTY_ACCESS`
    // above already covers the real property-access form for `document`/
    // `window`/`navigator`.
    if (ts.isIdentifier(node) && FORBIDDEN_BARE_GLOBALS.has(node.text) && !isBindingPosition(node)) {
      report(node, `references the global '${node.text}'`);
    }
  });

  return violations;
}

function isBindingPosition(node) {
  const { parent } = node;
  if (!parent) return false;
  if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)) && parent.name === node) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isImportSpecifier(parent) && parent.name === node) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Rule 2: module-level mutable state
// ---------------------------------------------------------------------------

function isMutableContainerInitializer(initializer) {
  if (!initializer) return false;
  if (ts.isArrayLiteralExpression(initializer)) return true;
  if (ts.isObjectLiteralExpression(initializer)) return true;
  if (ts.isNewExpression(initializer) && ts.isIdentifier(initializer.expression)) {
    return ['Map', 'Set', 'WeakMap', 'Array'].includes(initializer.expression.text);
  }
  return false;
}

// True when `node` (an Identifier already known to spell a candidate
// container's name) is used here as the receiver of a mutation: a call to a
// known mutating method, or the target of a property/index assignment.
// Matched by name only, not by resolved binding (a real binder/checker is
// more than this guard needs) - a documented limit, same shape as
// check-editor-dependency-directions.mjs's SINGLE_OWNER_PATTERN text scan:
// safe here because every candidate name in DETECTION_MODULES today
// (IDENTITY, PAINT_OPERATORS, KIND_GROUPS, CHECKBOX_GLYPHS, KINDS, ...) is
// distinctive enough that no unrelated nested local plausibly shares it.
function isMutatingUse(node) {
  const { parent } = node;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
    const call = parent.parent;
    if (MUTATING_METHODS.has(parent.name.text) && ts.isCallExpression(call) && call.expression === parent) return true;
    const assignment = parent.parent;
    if (ts.isBinaryExpression(assignment) && assignment.left === parent && ASSIGNMENT_OPERATORS.has(assignment.operatorToken.kind)) return true;
  }
  if (ts.isElementAccessExpression(parent) && parent.expression === node) {
    const assignment = parent.parent;
    if (ts.isBinaryExpression(assignment) && assignment.left === parent && ASSIGNMENT_OPERATORS.has(assignment.operatorToken.kind)) return true;
  }
  return false;
}

export function checkModuleLevelState(sourceFile, relPath) {
  const violations = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const { declarationList } = statement;
    // No NodeFlags.Const or NodeFlags.Let set means `var`.
    const isConst = (declarationList.flags & ts.NodeFlags.Const) !== 0;
    const isLet = (declarationList.flags & ts.NodeFlags.Let) !== 0;

    for (const decl of declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue; // destructuring - out of scope, none in these files today
      const name = decl.name.text;

      if (!isConst) {
        violations.push(`${relPath}:${lineOf(sourceFile, decl)}: top-level '${isLet ? 'let' : 'var'} ${name}' is module-level mutable state`);
        continue;
      }

      if (!isMutableContainerInitializer(decl.initializer)) continue;

      let mutated = false;
      forEachNode(sourceFile, (node) => {
        if (mutated || !ts.isIdentifier(node) || node.text !== name || node === decl.name) return;
        if (isMutatingUse(node)) mutated = true;
      });
      if (mutated) {
        violations.push(`${relPath}:${lineOf(sourceFile, decl)}: top-level 'const ${name}' is a container that gets mutated after creation`);
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function moduleList() {
  const modules = [...DETECTION_MODULES];
  if (existsSync(path.join(ROOT, DETECTION_ENTRY_POINT))) modules.push(DETECTION_ENTRY_POINT);
  return modules;
}

export function checkAll() {
  const violations = [];
  const missing = [];
  const scanned = [];

  for (const relPath of moduleList()) {
    const absPath = path.join(ROOT, relPath);
    if (!existsSync(absPath)) {
      missing.push(relPath);
      continue;
    }
    scanned.push(relPath);
    const sourceFile = parseModule(relPath, readFileSync(absPath, 'utf8'));
    violations.push(
      ...checkForbiddenImports(sourceFile, relPath),
      ...checkForbiddenGlobals(sourceFile, relPath),
      ...checkModuleLevelState(sourceFile, relPath),
    );
  }

  return { violations, missing, scanned };
}

function main() {
  const { violations, missing, scanned } = checkAll();

  if (missing.length > 0) {
    console.error('Detection purity guard: DETECTION_MODULES names a file that no longer exists:');
    for (const relPath of missing) console.error(`  ${relPath}`);
    console.error('Update the constant at the top of scripts/check-detection-purity.mjs (see ARCH-24).');
    process.exitCode = 1;
    return;
  }

  if (violations.length > 0) {
    console.error('Detection purity guard failed: field detection must stay plain data in, plain data out.');
    console.error('Every pdf-lib/pdf.js/DOM/time/random touch belongs to a named shim in BOUNDARY_SHIMS, or nowhere at all.');
    for (const violation of violations) console.error(`  ${violation}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Detection purity guard passed: ${scanned.length} module(s) scanned, 0 violations.`);
}

// Kept last, same guard as check-module-boundaries.mjs, so importing this
// module for its exported functions (this script's own unit test) never
// re-runs main() as a side effect.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
