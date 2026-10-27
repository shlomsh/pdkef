import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// ARCH-73: a promise nobody awaits must say what happens when it rejects.
// A finding is an expression statement (a statement whose value is dropped) that is
//   (a) a `.then(...)` / `.catch(...)` / `.finally(...)` chain with no rejection
//       handler anywhere in it (`.catch(h)` or `.then(ok, h)`), or
//   (b) a bare call to a name this file declares async (async function, async
//       arrow / function expression bound to a const, async method) or to a
//       promise-returning DOM method (exitFullscreen, requestFullscreen), or
//   (c) `void <call>` (not a chain carrying a handler) without a `// reason: <why>` comment on the same line or
//       the line directly above.
// Not flagged: awaited, returned, assigned, or passed-along promises (they are not
// expression statements), and a chain that carries a handler. Heuristic only: no type
// checker, so a promise-returning call the file does not declare itself (an imported
// async function called bare) is not seen; write those as `.catch(...)` or `void ...`.
// A rejection handler must still report or carry `// expected:` (check-swallowed-errors).
// Any finding fails, printed as path:line. `--list` prints them and exits 0.

const __filename = fileURLToPath(import.meta.url);
const root = path.join(path.dirname(__filename), '..');
const srcDir = path.join(root, 'src');

const REASON = /\/\/\s*reason:/;
// Promise-returning DOM methods, called bare as often as not.
const DOM_ASYNC = new Set(['exitFullscreen', 'requestFullscreen']);
const CHAIN = new Set(['then', 'catch', 'finally']);
const isAsync = (n) => (ts.getCombinedModifierFlags?.(n) & ts.ModifierFlags.Async) !== 0 || n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

/** Names a file declares async: function declarations, bound async arrows/function expressions, methods. */
function asyncNames(sf) {
  const names = new Set();
  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && isAsync(n)) names.add(n.name.text);
    else if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name) && isAsync(n)) names.add(n.name.text);
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const i = n.initializer;
      if ((ts.isArrowFunction(i) || ts.isFunctionExpression(i)) && isAsync(i)) names.add(n.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

/** The `.then/.catch/.finally` calls that make up a chain, outermost first; [] if `call` is not a chain. */
function chainLinks(call) {
  const links = [];
  let cur = call;
  while (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression) && CHAIN.has(cur.expression.name.text)) {
    links.push(cur);
    cur = cur.expression.expression;
  }
  return links;
}

const hasRejectionHandler = (links) =>
  links.some((c) => {
    const m = c.expression.name.text;
    return m === 'catch' ? c.arguments.length > 0 : m === 'then' && c.arguments.length > 1;
  });

/** Line numbers (1-based) of every floating promise in `text`. */
export function findFloating(text, fileName = 'x.ts') {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const lines = text.split('\n');
  const names = asyncNames(sf);
  const found = [];
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line;
  const hasReason = (line) => REASON.test(lines[line]) || (line > 0 && REASON.test(lines[line - 1]));
  const calleeName = (call) => {
    const e = call.expression;
    if (ts.isIdentifier(e)) return e.text;
    if (ts.isPropertyAccessExpression(e) && (e.expression.kind === ts.SyntaxKind.ThisKeyword || DOM_ASYNC.has(e.name.text))) return e.name.text;
    return '';
  };
  const visit = (n) => {
    if (ts.isExpressionStatement(n)) {
      const e = n.expression;
      const line = lineOf(n.getStart(sf));
      if (ts.isVoidExpression(e)) {
        const inner = e.expression;
        if (ts.isCallExpression(inner) && !hasRejectionHandler(chainLinks(inner)) && !hasReason(line)) found.push(line + 1);
      } else if (ts.isCallExpression(e)) {
        const links = chainLinks(e);
        if (links.length) {
          if (!hasRejectionHandler(links)) found.push(line + 1);
        } else if ((names.has(calleeName(e)) || DOM_ASYNC.has(calleeName(e)))) {
          found.push(line + 1);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return [...new Set(found)].sort((a, b) => a - b);
}

const SKIP_FILE = /\.(test|spec)\.[^/]*$/;
function collect(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(root, full).split(path.sep).join('/');
    if (e.isDirectory()) {
      if (e.name === 'e2e' || rel === 'src/test') continue;
      collect(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(e.name) && !SKIP_FILE.test(e.name)) {
      out.push({ full, rel });
    }
  }
  return out;
}

function scan() {
  const result = {};
  for (const { full, rel } of collect(srcDir)) {
    const lines = findFloating(fs.readFileSync(full, 'utf8'), full);
    if (lines.length) result[rel] = lines;
  }
  return result;
}

function main() {
  const found = scan();
  const files = Object.keys(found).sort();
  const total = files.reduce((n, f) => n + found[f].length, 0);
  const list = process.argv.includes('--list');
  if (total === 0) {
    console.log('floating-promises: PASS (0 findings)');
    return;
  }
  const out = list ? console.log : console.error;
  if (!list) out('floating-promises: a promise statement needs a rejection handler (.catch / .then(ok, err), e.g. reportError), await, or "void ...; // reason: <why>". Findings:');
  for (const f of files) for (const l of found[f]) out(`${f}:${l}`);
  out(`floating-promises: ${total} findings in ${files.length} files`);
  if (!list) {
    console.error('floating-promises: FAIL');
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main();
