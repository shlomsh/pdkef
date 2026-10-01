// DEBT-21: a flag that disables a control for the navigation it starts must come
// from useNavigatingAway() (src/lib/useNavigatingAway.ts), never a plain
// useState(false). Pressing Back restores the page the browser froze on the way
// out, island state and all (bfcache), so a plain flag comes back set and the
// control it disabled is dead for good. The full story is in
// .claude/rules/tools-and-shell.md; nothing in jsdom or default Playwright can
// see the failure, so this is a static check.
//
// A violation ties the flag to the navigation, which is what keeps a legitimate
// plain useState(false) (PdfMergeTool's isRestoredWorkspace) green:
//   - a navigation is an assignment to `location.href` / `location`, a call to
//     `location.assign` / `location.replace`, or a call to a `navigate` function
//     the component receives (Merge and Split take an injectable one);
//   - the flag is the state of a `useState(...)` destructuring whose setter is
//     called with `true` in the function that performs the navigation, or in a
//     function that encloses it, below the component that declared the state;
//   - a call inside a `catch` clause does not count: that is the failure path
//     (`setHandoffFailed(true)` when the hand-off could not start), where the
//     navigation never happened and nothing is left to restore.
//
// Parses with the TypeScript compiler API rather than regexes, the same way and
// for the same reason as scripts/check-detection-purity.mjs: comments and strings
// (this rule is quoted in several) are not nodes in an AST.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Straight from node_modules, past Vite (see check-detection-purity.mjs).
const ts = createRequire(import.meta.url)('typescript');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const GLOBAL_OBJECTS = new Set(['window', 'document', 'globalThis', 'self']);

const isFunctionLike = (node) => ts.isFunctionLike(node) && !!node.body;

// `location`, or `window.location` and its siblings.
function isLocationRef(node) {
  if (ts.isIdentifier(node)) return node.text === 'location';
  return ts.isPropertyAccessExpression(node)
    && node.name.text === 'location'
    && ts.isIdentifier(node.expression)
    && GLOBAL_OBJECTS.has(node.expression.text);
}

function isNavigation(node) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    const { left } = node;
    if (isLocationRef(left)) return true;
    return ts.isPropertyAccessExpression(left) && left.name.text === 'href' && isLocationRef(left.expression);
  }
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'navigate';
  if (!ts.isPropertyAccessExpression(callee)) return false;
  if (isLocationRef(callee.expression)) return callee.name.text === 'assign' || callee.name.text === 'replace';
  return callee.name.text === 'navigate' && ts.isIdentifier(callee.expression) && callee.expression.text === 'props';
}

// `setX(true)` and `setX(() => true)`.
function isSetterCalledWithTrue(node) {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.arguments.length !== 1) return false;
  const [arg] = node.arguments;
  if (arg.kind === ts.SyntaxKind.TrueKeyword) return true;
  return ts.isArrowFunction(arg) && arg.body.kind === ts.SyntaxKind.TrueKeyword;
}

function isUseStateCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  return (ts.isIdentifier(callee) && callee.text === 'useState')
    || (ts.isPropertyAccessExpression(callee) && callee.name.text === 'useState');
}

const nearestFunction = (node) => {
  for (let up = node.parent; up; up = up.parent) if (isFunctionLike(up)) return up;
  return null;
};

// Every `const [flag, setFlag] = useState(...)`: where it lives and what it is called.
function collectStates(sourceFile) {
  const states = [];
  const visit = (node) => {
    if (ts.isVariableDeclaration(node)
      && node.initializer && isUseStateCall(node.initializer)
      && ts.isArrayBindingPattern(node.name)) {
      const [flag, setter] = node.name.elements;
      if (setter && ts.isBindingElement(setter) && ts.isIdentifier(setter.name)) {
        states.push({
          flag: flag && ts.isBindingElement(flag) && ts.isIdentifier(flag.name) ? flag.name.text : setter.name.text,
          setter: setter.name.text,
          declaredIn: nearestFunction(node),
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return states;
}

function collectNavigations(sourceFile) {
  const navigations = [];
  const visit = (node) => {
    if (isNavigation(node)) navigations.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return navigations;
}

const settersCalledWithTrue = (root) => {
  const names = new Set();
  const visit = (node) => {
    if (ts.isCatchClause(node)) return;
    if (isSetterCalledWithTrue(node)) names.add(node.expression.text);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return names;
};

const encloses = (outer, inner) => outer !== null && outer.pos <= inner.pos && inner.end <= outer.end;

// The functions from the navigation outwards, stopping before the one that
// declared the state: the navigating function and every callback chain around it.
function* navigationChain(navigation, declaredIn) {
  for (let fn = nearestFunction(navigation); fn && fn !== declaredIn; fn = nearestFunction(fn)) yield fn;
}

/**
 * @param {string} source
 * @param {string} fileName used for the report and to pick the TS/JS parse mode
 * @returns {{ file: string, line: number, flag: string }[]} one per offending useState declaration
 */
export function findViolations(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const states = collectStates(sourceFile);
  if (states.length === 0) return [];
  const navigations = collectNavigations(sourceFile);

  const violations = new Map();
  for (const navigation of navigations) {
    for (const state of states) {
      if (!encloses(state.declaredIn, navigation)) continue;
      for (const fn of navigationChain(navigation, state.declaredIn)) {
        if (settersCalledWithTrue(fn).has(state.setter)) violations.set(state, state);
      }
    }
  }
  return [...violations.keys()]
    .sort((a, b) => a.line - b.line)
    .map(({ line, flag }) => ({ file: fileName, line, flag }));
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return SOURCE_EXTENSIONS.test(entry.name) && !TEST_FILE.test(entry.name) ? [full] : [];
  });
}

export function checkTree(root = path.join(ROOT, 'src')) {
  return sourceFiles(root).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return source.includes('useState') ? findViolations(source, path.relative(ROOT, file)) : [];
  });
}

function main() {
  const violations = checkTree();
  if (violations.length === 0) {
    console.log('Navigating-away guard passed: no plain useState flag is set on a navigation path.');
    return;
  }
  console.error('Navigating-away guard failed: a flag set for the navigation it starts must be useNavigatingAway(), not useState.');
  for (const { file, line, flag } of violations) console.error(`  ${file}:${line}  ${flag}`);
  console.error('Why: Back restores the page with the flag still set and the control dead. See .claude/rules/tools-and-shell.md and src/lib/useNavigatingAway.ts (DEBT-21).');
  process.exitCode = 1;
}

// Kept last so importing this module for its exports (the unit test) never runs main().
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
