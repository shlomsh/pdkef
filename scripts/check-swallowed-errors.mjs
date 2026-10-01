import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// DEBT-27: a ratchet for "every catch that discards its error must report it or
// say why" (.claude/rules/tools-and-shell.md, docs/debt-17-catch-triage.md).
// A finding is a `catch` clause, or a function passed to `.catch(...)`, that
//   (a) has no `throw` in its body,
//   (b) calls no `reportError` / `report*Error` function, and
//   (c) carries no `// expected: <why>` comment inside it or on the line
//       directly above the `catch` keyword / `.catch(` call.
// Per-file counts are held in scripts/swallowed-errors-baseline.json and may
// only go down. `--write-baseline` regenerates it from the current tree.
//
// Simplification: `throw` is looked for in the body but not inside nested
// functions (a throw in a callback is not a rethrow); report calls count
// anywhere in the body, nested or not.

const __filename = fileURLToPath(import.meta.url);
const root = path.join(path.dirname(__filename), '..');
const srcDir = path.join(root, 'src');
const baselinePath = path.join(path.dirname(__filename), 'swallowed-errors-baseline.json');

const EXPECTED = /\/\/\s*expected:/;
const isFn = (n) => ts.isFunctionLike(n);
const isReporter = (name) => name === 'reportError' || /^report.*Error$/.test(name);

function calleeName(call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return '';
}

function inspectBody(body) {
  let throws = false;
  let reports = false;
  const visit = (n, nested) => {
    if (ts.isThrowStatement(n) && !nested) throws = true;
    if (ts.isCallExpression(n) && isReporter(calleeName(n))) reports = true;
    ts.forEachChild(n, (c) => visit(c, nested || isFn(c)));
  };
  visit(body, false);
  return { throws, reports };
}

/** Line numbers (1-based) of every swallowed catch in `text`. */
export function findSwallowed(text, fileName = 'x.ts') {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const lines = text.split('\n');
  const found = [];
  const check = (node, keywordPos, body) => {
    const { throws, reports } = inspectBody(body);
    if (throws || reports) return;
    const line = sf.getLineAndCharacterOfPosition(keywordPos).line;
    if (EXPECTED.test(text.slice(node.getStart(sf), node.end))) return;
    if (line > 0 && EXPECTED.test(lines[line - 1])) return;
    found.push(line + 1);
  };
  const visit = (n) => {
    if (ts.isCatchClause(n)) {
      check(n, n.getStart(sf), n.block);
    } else if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'catch'
    ) {
      for (const arg of n.arguments) {
        if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
          check(arg, n.expression.name.getStart(sf), arg.body);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found.sort((a, b) => a - b);
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
  const counts = Object.fromEntries(Object.keys(found).sort().map((f) => [f, found[f].length]));
  if (process.argv.includes('--write-baseline')) {
    fs.writeFileSync(baselinePath, JSON.stringify(counts, null, 2) + '\n');
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`swallowed-errors: baseline written, ${total} in ${Object.keys(counts).length} files`);
    return;
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const worse = [];
  const better = [];
  for (const f of new Set([...Object.keys(counts), ...Object.keys(baseline)])) {
    const now = counts[f] ?? 0;
    const was = baseline[f] ?? 0;
    if (now > was) worse.push(f);
    else if (now < was) better.push(`${f} (${was} -> ${now})`);
  }
  for (const f of worse) {
    console.error(`${f}: ${counts[f]} swallowed catches, baseline ${baseline[f] ?? 0}. Report with reportError(area, err, step), rethrow, or add "// expected: <why>". Findings:`);
    for (const l of found[f]) console.error(`  ${f}:${l}`);
  }
  if (better.length) {
    console.error(`swallowed-errors: fewer than the baseline, lower it with: npm run test:swallowed-errors -- --write-baseline\n  ${better.join('\n  ')}`);
  }
  if (worse.length || better.length) {
    console.error('swallowed-errors: FAIL');
    process.exit(1);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`swallowed-errors: PASS (${total} baselined in ${Object.keys(counts).length} files)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main();
