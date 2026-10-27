#!/usr/bin/env node
// ARCH-50: file and function length are ratchets that only shrink. Every file over
// 800 lines and every function over 300 is recorded at its current length under
// "size" in scripts/ratchet-limits.json. The check fails when a record grows or an
// unrecorded file/function crosses the threshold. A shrink passes; locally it also
// rewrites the record lower (or drops it), in CI it only prints. ARCH-76's
// check-ratchet-raises refuses any raise of the records themselves.
//
//   node scripts/check-size-ratchet.mjs          check (and lower records outside CI)
//   node scripts/check-size-ratchet.mjs --init   write the current snapshot
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { readRatchetLimits, writeRatchetLimits } from './ratchet-limits.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCOPE_DIRS = ['src/', 'scripts/', 'api/'];

// Pure: is this repo-relative path one the ratchet measures?
export function isSizeScoped(file) {
  if (!/\.(js|mjs|ts|tsx)$/.test(file) || file.endsWith('.d.ts')) return false;
  if (/\.(test|spec)\.[^/]+$/.test(file) || file.split('/').includes('e2e')) return false;
  return file === 'middleware.ts' || SCOPE_DIRS.some((d) => file.startsWith(d));
}

const FUNCTION_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
]);
const CLASS_KINDS = new Set([ts.SyntaxKind.ClassDeclaration, ts.SyntaxKind.ClassExpression]);

function ownName(node) {
  if (node.kind === ts.SyntaxKind.Constructor) return 'constructor';
  if (node.name) {
    const text = node.name.getText();
    if (node.kind === ts.SyntaxKind.GetAccessor) return `get ${text}`;
    if (node.kind === ts.SyntaxKind.SetAccessor) return `set ${text}`;
    return text;
  }
  const p = node.parent;
  if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) && p.name) return p.name.getText();
  return '(anonymous)';
}

// Pure: measure one source string. functions are in source order, names carry
// `~2`, `~3` for repeats within the file.
export function measureSource(source, fileName) {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : undefined);
  const found = [];
  const visit = (node, chain) => {
    let next = chain;
    if (FUNCTION_KINDS.has(node.kind)) {
      const name = [...chain, ownName(node)].join('.');
      const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
      const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
      found.push({ name, lines: end - start + 1 });
      next = [...chain, ownName(node)];
    } else if (CLASS_KINDS.has(node.kind) && node.name) {
      next = [...chain, node.name.getText()];
    }
    ts.forEachChild(node, (child) => visit(child, next));
  };
  visit(sf, []);
  const seen = new Map();
  const functions = found.map(({ name, lines }) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return { name: n === 1 ? name : `${name}~${n}`, lines };
  });
  const fileLines = source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
  return { fileLines, functions };
}

// Pure: { [file]: measureSource() } -> the records worth keeping.
export function snapshot(measured, { fileThreshold, functionThreshold }) {
  const fileLines = {};
  const functionLines = {};
  for (const [file, m] of Object.entries(measured)) {
    if (m.fileLines > fileThreshold) fileLines[file] = m.fileLines;
    for (const f of m.functions) if (f.lines > functionThreshold) functionLines[`${file}#${f.name}`] = f.lines;
  }
  return { fileLines, functionLines };
}

// Pure: recorded vs current (both snapshot-shaped). A failure is a record that
// grew or an unrecorded entry over the threshold; `lowered` lists records that
// shrank (to a number) or fell away (to null).
export function compareSize(recorded, current, { fileThreshold, functionThreshold }) {
  const failures = [];
  const lowered = [];
  for (const [kind, field, threshold] of [['file', 'fileLines', fileThreshold], ['function', 'functionLines', functionThreshold]]) {
    for (const [key, now] of Object.entries(current[field])) {
      const was = recorded[field][key] ?? threshold;
      if (now > was) failures.push({ key, kind, recorded: was, current: now });
    }
    for (const [key, was] of Object.entries(recorded[field])) {
      const now = current[field][key];
      if (now === undefined) lowered.push({ key, kind, from: was, to: null });
      else if (now < was) lowered.push({ key, kind, from: was, to: now });
    }
  }
  return { failures, lowered };
}

function measureTree() {
  const files = execFileSync('git', ['ls-files', 'src', 'scripts', 'api', 'middleware.ts'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter((f) => f && isSizeScoped(f) && fs.existsSync(path.join(root, f)));
  const measured = {};
  for (const f of files) measured[f] = measureSource(fs.readFileSync(path.join(root, f), 'utf8'), f);
  return measured;
}

function main(args) {
  const limits = readRatchetLimits(root);
  const size = limits.size ?? { fileLines: {}, functionLines: {} };
  const thresholds = { fileThreshold: size.fileThreshold ?? 800, functionThreshold: size.functionThreshold ?? 300 };
  const current = snapshot(measureTree(), thresholds);

  if (args.includes('--init')) {
    writeRatchetLimits({ ...limits, size: { ...thresholds, ...current } }, root);
    console.log(`size-ratchet: recorded ${Object.keys(current.fileLines).length} files over ${thresholds.fileThreshold} lines and ${Object.keys(current.functionLines).length} functions over ${thresholds.functionThreshold}.`);
    return 0;
  }

  const recorded = { fileLines: size.fileLines ?? {}, functionLines: size.functionLines ?? {} };
  const { failures, lowered } = compareSize(recorded, current, thresholds);

  if (lowered.length > 0) {
    const lines = lowered.map((l) => `  ${l.key}: ${l.from} -> ${l.to ?? 'under the threshold (record dropped)'}`);
    if (process.env.CI) {
      console.log(`size-ratchet: ${lowered.length} record(s) can be lowered (run it locally to rewrite scripts/ratchet-limits.json):\n${lines.join('\n')}`);
    } else {
      writeRatchetLimits({ ...limits, size: { ...thresholds, ...current } }, root);
      console.log(`size-ratchet: lowered ${lowered.length} record(s) in scripts/ratchet-limits.json:\n${lines.join('\n')}`);
    }
  }

  if (failures.length > 0) {
    console.error(`Size ratchet: ${failures.length} file(s)/function(s) grew past their record. Split the code instead of raising a record:`);
    for (const f of failures) console.error(`  ${f.kind} ${f.key}: ${f.recorded} -> ${f.current} lines`);
    return 1;
  }
  console.log(`size-ratchet: ok (${Object.keys(current.fileLines).length} files over ${thresholds.fileThreshold}, ${Object.keys(current.functionLines).length} functions over ${thresholds.functionThreshold}).`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
