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
//   1. No import of pdfjs-dist, @cantoo/pdf-lib or preact - static, dynamic
//      `import(...)`, or a bare `require(...)` - in a detection module,
//      except a file on the BOUNDARY_SHIMS allowlist, which is exempt from
//      the package-import half of this rule only. Within a shim file, every
//      reference to a binding the file imported from one of those packages
//      (and every dynamic import()/require() call for one) must itself sit
//      inside a function named on that file's FUNCTION_SHIMS allowlist -
//      the exemption is per function, not per file (FORM-22 review,
//      finding 4), so a plain helper living beside a real shim in the same
//      file gets no free pass.
//   1b. No reference to a DOM/storage/network global - `globalThis`, `self`,
//      `window`, `document`, `navigator`, `localStorage`, `sessionStorage`,
//      `indexedDB`, `fetch`, `XMLHttpRequest` - however it is reached: bare
//      (`self`), as the object of a property access (`self.document.title`,
//      `globalThis.document`), or as the source object of a destructure
//      (`const { document: doc } = globalThis`). Catching the identifier
//      reference itself catches every one of those forms in one rule,
//      because in each case the forbidden name is what gets referenced, not
//      a property name that happens to read the same (FORM-22 review,
//      finding 1). A name that is locally declared in an enclosing scope
//      (a parameter, a shadowing local) is not the global and is not
//      flagged. A shim still may not touch any of these; nothing here needs
//      to.
//   2. No module-level mutable state: a top-level `let`/`var` is a violation
//      outright; a top-level `const` bound to `new Map/Set/WeakMap/Array`, an
//      array literal or an object literal is a violation only if something
//      later in the file mutates it (a lookup table that is only ever read -
//      `.has()`, indexed, spread - is not state). A same-named mutation
//      inside a function only counts against the top-level binding if the
//      reference actually resolves to it; a closer declaration of the same
//      name (a parameter, a shadowing local) binds the name to something
//      else and is not this rule's business (FORM-22 review, finding 3).
//   3. No `Date.now()`, `new Date()`, `Math.random()`, `performance.now()`,
//      `crypto.randomUUID()` or `crypto.getRandomValues()` anywhere in a
//      detection module.
//
// Rules 1b and 2's "locally declared" and "resolves to it" carve-outs need
// real scope resolution, not a name-only scan: `createChecker` builds a
// full TypeScript type checker over a single in-memory, `noLib` Program for
// exactly that. With no lib files loaded, an unresolved identifier - one no
// declaration in the file can explain - is a real, undeclared global by
// construction; that is the whole trick, and it costs one Program per file
// (still comfortably sub-second across all ten - see the "Landed" note in
// backlog/tasks/FORM-22.md for the measured run).

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
  'src/editor/adapters/pdf/inkEdges.js',
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
// loophole: every other rule (module-level state, Date/Math/performance,
// DOM globals) still applies to a shim in full, and - since FORM-22's
// review - so does FUNCTION_SHIMS below: this map says a file may hold the
// `import` statement, FUNCTION_SHIMS says which of its functions may
// actually use what it imports.
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

// The per-function half of the allowlist (FORM-22 review, finding 4): a
// shim file may import pdf-lib/pdf.js, but every reference to what it
// imported must sit inside one of the functions named here. Read straight
// from today's code (2026-09-25), one line per function that touches an
// import, honestly - including a function that is pure logic reading plain
// values off a parameter the caller happens to have gotten from pdf-lib,
// not only the ones that call pdf-lib/pdf.js APIs directly.
export const FUNCTION_SHIMS = new Map([
  [
    'src/editor/adapters/pdf/pageInk.js',
    new Map([
      ['pageCropBox', "reads a pdf-lib page's CropBox/MediaBox (PDFName lookups) into a plain rect."],
      ['collectPageInk', 'the file\'s other named shim; delegates the pdf-lib access entirely to '
        + "pdfObjects.js's getPageContentBytes and never dereferences an import itself, but it is "
        + "what makes the file a shim at all, so it is named here rather than left implicit."],
    ]),
  ],
  [
    'src/editor/adapters/pdf/pdfObjects.js',
    new Map([
      ['lookupDict', 'resolves a context reference to a PDFDict; the shared primitive every other '
        + 'dict-reading function below calls.'],
      ['numberAt', 'resolves one PDFName.of(key) dict entry into a plain number.'],
      ['getPageContentBytes', "concatenates a pdf-lib page's content streams (PDFStream/PDFArray/"
        + 'decodePDFRawStream) into one plain byte buffer.'],
      ['readFont', 'reads a pdf-lib font dict (Type0 descendant, /W widths, FontDescriptor) into '
        + 'plain glyph metrics; the biggest single adapter in the file.'],
      ['buildFontTable', "walks a pdf-lib Resources dict's /Font entries into a plain lookup table."],
      ['buildXObjectTable', "walks a pdf-lib Resources dict's /XObject entries into a plain lookup "
        + 'table.'],
      ['collectCheckboxGlyphs', "reads a pdf-lib page's Resources dict once before walking its own "
        + 'already-decoded content-stream tokens; the one PDFName reference is why the whole '
        + 'function needs to be here even though most of its body is pure geometry.'],
      ['inheritedEntry', "walks a widget's PDFDict parent chain to read one inheritable field "
        + 'attribute into a plain value.'],
      ['pageWidgets', "reads a pdf-lib page's /Annots array into plain widget dicts."],
      ['widgetEntries', 'reads the five widget/field entries pdf-lib exposes into a plain '
        + 'WidgetEntry object.'],
      ['extractPageObjects', "reads a pdf-lib page's Resources dict and content bytes once before "
        + 'walking its own already-decoded tokens, the same shape as collectCheckboxGlyphs.'],
      ['hasFillableAcroForm', "reads a pdf-lib document's AcroForm dict into a plain boolean. It "
        + 'references no import identifier directly - `pdfDoc.catalog.getAcroForm()` calls a method '
        + 'on its parameter rather than naming PDFName/PDFDict/etc. - so nothing here would actually '
        + 'flag it; it is listed anyway because its parameter is a pdf-lib PDFDocument and hiding '
        + 'that would be the dishonest version of this allowlist.'],
    ]),
  ],
  [
    'src/editor/adapters/pdf/corpus/scoring/score.js',
    new Map([
      ['pageTextRuns', 'opens a real PDF through pdfjs-dist (dynamic import) and reads its text '
        + 'layer for scoring (MOBI-13).'],
      ['scoreForm', 'loads the PDF through pdf-lib (`PDFDocument.load`) and reads its page before '
        + 'scoring; this one was getting the package "for free" off the file-level exemption before '
        + 'this review (FORM-22 review, finding 4) even though nothing named it - it genuinely '
        + 'adapts a pdf-lib document into inputs for the rest of the pipeline, so it earns its place '
        + 'honestly rather than by omission.'],
    ]),
  ],
]);

const FORBIDDEN_PACKAGES = ['pdfjs-dist', '@cantoo/pdf-lib', 'preact'];

function isForbiddenPackage(specifier) {
  return FORBIDDEN_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`));
}

// Identifiers that always reach outside a detector's plain-data inputs,
// however they are referenced (see rule 1b above). `Math`/`Date`/
// `performance`/`crypto` are deliberately not here: those are otherwise
// ordinary, pure globals, and only specific nondeterministic members of
// them are forbidden (FORBIDDEN_NONDETERMINISTIC_MEMBERS below) - `Math.min`
// etc. are ordinary arithmetic this codebase uses constantly and must stay
// allowed.
const FORBIDDEN_GLOBAL_REFERENCES = new Set([
  'globalThis', 'self', 'window', 'document', 'navigator',
  'localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest',
]);

const FORBIDDEN_NONDETERMINISTIC_MEMBERS = new Map([
  ['Math', new Set(['random'])],
  ['Date', new Set(['now'])],
  ['performance', new Set(['now'])],
  ['crypto', new Set(['randomUUID', 'getRandomValues'])],
]);

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

// A single-file, `noLib` Program's type checker, used only for scope
// resolution (`getSymbolAtLocation`), never for type information. With no
// lib files loaded, the checker cannot see ambient globals like `document`
// or `Math` at all, so an identifier resolves here if and only if some
// declaration inside this file explains it (a parameter, a local
// var/let/const, an import specifier, a function/class name...) - exactly
// the "is this name locally bound" question rules 1b and 2 need answered,
// with none of the false confidence a name-only text match would carry.
export function createChecker(sourceFile) {
  const compilerOptions = {
    allowJs: true, checkJs: false, noLib: true, target: ts.ScriptTarget.Latest,
  };
  const host = {
    getSourceFile: (fileName) => (fileName === sourceFile.fileName ? sourceFile : undefined),
    writeFile: () => {},
    getDefaultLibFileName: () => 'lib.d.ts',
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => '',
    getNewLine: () => '\n',
    fileExists: (fileName) => fileName === sourceFile.fileName,
    readFile: () => undefined,
  };
  const program = ts.createProgram([sourceFile.fileName], compilerOptions, host);
  return program.getTypeChecker();
}

// True when `node` resolves to a real declaration inside this file - a
// symbol with at least one declaration. `globalThis` (and a handful of
// other well-known names) get a synthetic checker symbol even under
// `noLib` with zero declarations, which is exactly the "not actually
// local" case this must say no to; a genuinely local binding always has a
// declaration node.
function isLocallyBound(checker, node) {
  const symbol = checker.getSymbolAtLocation(node);
  return Boolean(symbol && symbol.declarations && symbol.declarations.length > 0);
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

// True when `node` is where a name gets bound rather than referenced: the
// declared name of a variable/parameter/binding element, a destructure's
// property key (`{ document: doc }` - the key is a selector, not a
// reference, same as `obj.document`'s member name), an object literal's
// property key, an import's local name, or a property access's member
// name. Every one of these can share text with a forbidden global or an
// imported binding without being a use of it.
function isBindingPosition(node) {
  const { parent } = node;
  if (!parent) return false;
  if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent)) && parent.name === node) return true;
  if (ts.isBindingElement(parent) && (parent.name === node || parent.propertyName === node)) return true;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isImportSpecifier(parent) && (parent.name === node || parent.propertyName === node)) return true;
  if (ts.isNamespaceImport(parent) && parent.name === node) return true;
  if (ts.isImportClause(parent) && parent.name === node) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  return false;
}

// Walks up to the nearest named function-like ancestor: a function
// declaration, a named function expression, a function/arrow expression
// assigned to a single identifier (`const foo = () => {}`), or a method.
// Returns null for a reference with no enclosing function at all (true
// module top level). FUNCTION_SHIMS entries are matched against exactly
// this name - the nearest one, so a reference inside a nested helper closes
// over the helper's own name, not its outer function's; a nested helper
// that itself needs to touch an import earns its own allowlist line rather
// than inheriting one silently.
function enclosingFunctionName(node) {
  let current = node.parent;
  while (current) {
    if ((ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current)) && current.name) {
      return current.name.text;
    }
    if (ts.isMethodDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
    if ((ts.isFunctionExpression(current) || ts.isArrowFunction(current))
      && current.parent && ts.isVariableDeclaration(current.parent)
      && ts.isIdentifier(current.parent.name) && current.parent.initializer === current) {
      return current.parent.name.text;
    }
    current = current.parent;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rule 1 (+1b): forbidden imports, the per-function shim allowlist, and DOM
// globals
// ---------------------------------------------------------------------------

// Local binding names this file imports from a forbidden package via a
// static `import` declaration - the names FUNCTION_SHIMS restricts to
// named functions in a shim file.
function importedForbiddenLocalNames(sourceFile) {
  const names = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.moduleSpecifier
      || !ts.isStringLiteral(statement.moduleSpecifier) || !isForbiddenPackage(statement.moduleSpecifier.text)) {
      continue;
    }
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) names.add(clause.name.text);
    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        names.add(clause.namedBindings.name.text);
      } else if (ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) names.add(element.name.text);
      }
    }
  }
  return names;
}

// `import type { PDFPage } from '@cantoo/pdf-lib'` (or every named element marked
// `type`) is erased at compile time: it names a shape, it loads nothing, so a pure
// detector may use it to describe its inputs.
function isTypeOnly(statement) {
  if (ts.isExportDeclaration(statement)) return statement.isTypeOnly;
  const clause = statement.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  const bindings = clause.namedBindings;
  return !clause.name && Boolean(bindings) && ts.isNamedImports(bindings)
    && bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
}

export function checkForbiddenImports(sourceFile, relPath, checker = createChecker(sourceFile)) {
  const violations = [];
  const exempt = BOUNDARY_SHIMS.has(relPath);
  const allowedFunctions = FUNCTION_SHIMS.get(relPath) ?? new Map();

  // Static `import`/`export ... from` declarations only ever appear at the
  // module's top level, per the language grammar, so there is no function
  // to scope this exemption to: a shim file's whole-file pass is the only
  // kind that can apply here.
  const reportStaticImport = (node, specifier) => {
    if (exempt) return;
    violations.push(`${relPath}:${lineOf(sourceFile, node)}: imports '${specifier}', which is not on the boundary-shim allowlist`);
  };

  // A dynamic import() or a require(...) call is an expression, so - unlike
  // a static import - it can sit inside a function, and in a shim file its
  // exemption is scoped to FUNCTION_SHIMS the same way a reference to an
  // already-imported binding is below.
  const reportCall = (node, specifier, verb) => {
    if (!exempt) {
      violations.push(`${relPath}:${lineOf(sourceFile, node)}: ${verb} '${specifier}', which is not on the boundary-shim allowlist`);
      return;
    }
    const fnName = enclosingFunctionName(node);
    if (!fnName || !allowedFunctions.has(fnName)) {
      const where = fnName ? `'${fnName}'` : 'module scope';
      violations.push(`${relPath}:${lineOf(sourceFile, node)}: ${verb} '${specifier}' from ${where}, which is not on this file's per-function allowlist`);
    }
  };

  for (const statement of sourceFile.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
      && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      if (isForbiddenPackage(specifier) && !isTypeOnly(statement)) reportStaticImport(statement, specifier);
    }
  }

  forEachNode(sourceFile, (node) => {
    // A dynamic `import(...)` call.
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteralLike(arg) && isForbiddenPackage(arg.text)) {
        reportCall(node, arg.text, 'dynamically imports');
      }
      return;
    }
    // A bare `require('pdfjs-dist')` (FORM-22 review, finding 5) - cheap to
    // catch with the AST already in hand, and the one other way a module
    // can pull a forbidden package in without a static `import` statement.
    // `require` is never declared by these ES modules, so `isLocallyBound`
    // only matters for a hypothetical local rebinding (`function f(require)
    // {...}`) - the same carve-out every other global reference here gets.
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require'
      && !isLocallyBound(checker, node.expression)) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteralLike(arg) && isForbiddenPackage(arg.text)) {
        reportCall(node, arg.text, 'calls require(...) on');
      }
    }
  });

  // The per-function half of the allowlist (FORM-22 review, finding 4):
  // every reference to a binding this file imported from a forbidden
  // package must sit inside one of the functions FUNCTION_SHIMS names for
  // it. Only reachable for a shim file - a non-shim file already failed on
  // its import declaration above, and nothing it exports is ever compared
  // against FUNCTION_SHIMS.
  if (exempt) {
    const importedNames = importedForbiddenLocalNames(sourceFile);
    if (importedNames.size > 0) {
      forEachNode(sourceFile, (node) => {
        if (!ts.isIdentifier(node) || !importedNames.has(node.text) || isBindingPosition(node)) return;
        const fnName = enclosingFunctionName(node);
        if (!fnName || !allowedFunctions.has(fnName)) {
          const where = fnName ? `'${fnName}'` : 'module scope';
          violations.push(`${relPath}:${lineOf(sourceFile, node)}: references imported '${node.text}' from ${where}, which is not on this file's per-function allowlist`);
        }
      });
    }
  }

  return violations;
}

export function checkForbiddenGlobals(sourceFile, relPath, checker = createChecker(sourceFile)) {
  const violations = [];
  const report = (node, message) => violations.push(`${relPath}:${lineOf(sourceFile, node)}: ${message}`);

  forEachNode(sourceFile, (node) => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date'
      && !isLocallyBound(checker, node.expression)) {
      report(node, "'new Date()' is nondeterministic; a detector must be pure");
      return;
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const objectName = node.expression.text;
      const onlyMembers = FORBIDDEN_NONDETERMINISTIC_MEMBERS.get(objectName);
      if (onlyMembers && onlyMembers.has(node.name.text) && !isLocallyBound(checker, node.expression)) {
        report(node, `'${objectName}.${node.name.text}' is nondeterministic; a detector must be pure`);
      }
      // Fall through deliberately: `node.expression` (the object identifier)
      // is visited again below as its own node, so a forbidden *global*
      // object (document.title) still gets checked by the identifier rule
      // even when it is not also a nondeterministic-member access.
    }
    // A reference to a forbidden DOM/storage/network global - bare, as the
    // object half of a property access, or as the source of a destructure
    // (rule 1b). Excludes a binding position (isBindingPosition) and a name
    // that resolves to a local declaration (isLocallyBound); see both
    // functions' own comments for why each is needed.
    if (ts.isIdentifier(node) && FORBIDDEN_GLOBAL_REFERENCES.has(node.text)
      && !isBindingPosition(node) && !isLocallyBound(checker, node)) {
      report(node, `references the global '${node.text}', which reaches outside the detector's plain-data inputs`);
    }
  });

  return violations;
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
// Whether that mutation counts against a particular top-level declaration is
// decided by the caller via scope resolution (checkModuleLevelState below);
// this only answers "is this use a mutation at all".
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

export function checkModuleLevelState(sourceFile, relPath, checker = createChecker(sourceFile)) {
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
        if (!isMutatingUse(node)) return;
        // A same-named mutation only counts against THIS top-level binding
        // if the reference actually resolves to it: a closer declaration in
        // an enclosing function or block scope - a parameter, a shadowing
        // local with the same name - binds the identifier to something else
        // entirely, and mutating that is none of this rule's business
        // (FORM-22 review, finding 3). `getSymbolAtLocation` is the real
        // TypeScript binder's answer to "what does this name resolve to
        // here", not a second name-only guess.
        const symbol = checker.getSymbolAtLocation(node);
        const resolvedDeclaration = symbol?.declarations?.[0];
        if (resolvedDeclaration === decl) mutated = true;
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
    const checker = createChecker(sourceFile);
    violations.push(
      ...checkForbiddenImports(sourceFile, relPath, checker),
      ...checkForbiddenGlobals(sourceFile, relPath, checker),
      ...checkModuleLevelState(sourceFile, relPath, checker),
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
    console.error('Every pdf-lib/pdf.js/DOM/time/random touch belongs to a named shim in BOUNDARY_SHIMS/FUNCTION_SHIMS, or nowhere at all.');
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
