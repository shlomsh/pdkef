import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// DEBT-27: zero tolerance for "every catch that discards its error must report
// it or say why" (.claude/rules/tools-and-shell.md, docs/debt-17-catch-triage.md).
// A finding is a `catch` clause, a function passed to `.catch(...)` or as the
// second argument of `.then(...)`, or a named handler passed in those positions, that
//   (a) has no top-level `throw` statement in its body (a conditional rethrow
//       still swallows in the other branch),
//   (b) calls no `reportError` / `report*Error` function outside a nested
//       function definition, and
//   (c) carries no `// expected: <why>` comment inside it or on the line
//       directly above the `catch` keyword / `.catch(` / `.then(` call.
// A named handler (identifier or member expression, not an inline function) is
// fine only if its name starts with `report` and ends with `Error`, or the line
// above carries `// expected:`.
// Any finding fails, printed as path:line. `--list` prints them and exits 0.

const __filename = fileURLToPath(import.meta.url);
const root = path.join(path.dirname(__filename), '..');
const srcDir = path.join(root, 'src');

const EXPECTED = /\/\/\s*expected:/;
const isFn = (n) => ts.isFunctionLike(n);
const isReporter = (name) => name === 'reportError' || /^report.*Error$/.test(name);
const isInlineFn = (n) => ts.isArrowFunction(n) || ts.isFunctionExpression(n);

function calleeName(call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return '';
}

function inspectBody(body) {
  // A throw counts only as a direct statement of the block; a report call only
  // outside nested function definitions.
  const throws = ts.isBlock(body) && body.statements.some((s) => ts.isThrowStatement(s));
  let reports = false;
  const visit = (n) => {
    if (ts.isCallExpression(n) && isReporter(calleeName(n))) reports = true;
    ts.forEachChild(n, (c) => {
      if (!isFn(c)) visit(c);
    });
  };
  visit(body);
  return { throws, reports };
}

/** Line numbers (1-based) of every swallowed catch in `text`. */
export function findSwallowed(text, fileName = 'x.ts') {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const lines = text.split('\n');
  const found = [];
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line;
  const annotatedAbove = (line) => line > 0 && EXPECTED.test(lines[line - 1]);
  const flag = (line) => found.push(line + 1);
  const check = (node, keywordPos, body) => {
    const { throws, reports } = inspectBody(body);
    if (throws || reports) return;
    const line = lineOf(keywordPos);
    if (EXPECTED.test(text.slice(node.getStart(sf), node.end))) return;
    if (annotatedAbove(line)) return;
    flag(line);
  };
  const checkNamed = (arg, namePos, callPos) => {
    const name = ts.isIdentifier(arg) ? arg.text : ts.isPropertyAccessExpression(arg) ? arg.name.text : null;
    if (name === null) return;
    if (name.startsWith('report') && name.endsWith('Error')) return;
    const line = lineOf(namePos);
    if (annotatedAbove(line) || annotatedAbove(lineOf(callPos))) return;
    flag(line);
  };
  const visit = (n) => {
    if (ts.isCatchClause(n)) {
      check(n, n.getStart(sf), n.block);
    } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const method = n.expression.name.text;
      const handler = method === 'catch' ? n.arguments[0] : method === 'then' ? n.arguments[1] : undefined;
      if (handler) {
        const namePos = n.expression.name.getStart(sf);
        if (isInlineFn(handler)) check(handler, namePos, handler.body);
        else checkNamed(handler, namePos, n.getStart(sf));
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
    } else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !SKIP_FILE.test(e.name)) {
      out.push({ full, rel });
    }
  }
  return out;
}

function scan() {
  const result = {};
  for (const { full, rel } of collect(srcDir)) {
    const lines = findSwallowed(fs.readFileSync(full, 'utf8'), full);
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
    console.log('swallowed-errors: PASS (0 findings)');
    return;
  }
  const out = list ? console.log : console.error;
  if (!list) out('swallowed-errors: each catch must report with reportError(area, err, step), rethrow, or carry "// expected: <why>". Findings:');
  for (const f of files) for (const l of found[f]) out(`${f}:${l}`);
  out(`swallowed-errors: ${total} findings in ${files.length} files`);
  if (!list) {
    console.error('swallowed-errors: FAIL');
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main();
