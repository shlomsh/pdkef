#!/usr/bin/env node
// ARCH-50 / ARCH-105: size is a set of ratchets that only shrink. Every file over
// 800 lines is recorded under "size" in scripts/ratchet-limits.json; every function
// over 150 lines under "functionSize"; every function nested deeper than 4 control
// blocks (if, for, while, do, switch, try, bare block; an else-if chain is one
// level, a nested function starts its own count) under "nesting". The check fails
// when a record grows or an unrecorded file/function crosses its threshold. A
// shrink passes; locally it also rewrites the record lower (or drops it), in CI it
// only prints. The function sections are top-level so ARCH-76's check-ratchet-raises,
// which skips a new section, accepts their first baseline and then refuses any raise.
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
  if (!/\.(js|mjs|ts|tsx|astro)$/.test(file) || file.endsWith('.d.ts')) return false;
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

// Pure: does this node open one nesting level, as ESLint max-depth counts it? An
// `else if` is the else branch of its parent if and adds none; catch and finally
// sit inside the try's level; a block counts only when it stands alone.
function opensNestingLevel(node) {
  switch (node.kind) {
    case ts.SyntaxKind.IfStatement:
      return !(ts.isIfStatement(node.parent) && node.parent.elseStatement === node);
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.ForOfStatement:
    case ts.SyntaxKind.WhileStatement:
    case ts.SyntaxKind.DoStatement:
    case ts.SyntaxKind.SwitchStatement:
    case ts.SyntaxKind.TryStatement:
      return true;
    case ts.SyntaxKind.Block: {
      const p = node.parent;
      return ts.isBlock(p) || ts.isCaseClause(p) || ts.isDefaultClause(p) || ts.isSourceFile(p) || ts.isLabeledStatement(p);
    }
    default:
      return false;
  }
}

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
  const fileLines = source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
  if (fileName.endsWith('.astro')) return { fileLines, functions: [] };
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith('x') ? ts.ScriptKind.TSX : undefined);
  const found = [];
  // `entry` is the innermost function's record; `depth` the control blocks open inside it.
  const visit = (node, chain, entry, depth) => {
    let next = chain;
    let nextEntry = entry;
    let nextDepth = depth;
    if (FUNCTION_KINDS.has(node.kind)) {
      const name = [...chain, ownName(node)].join('.');
      const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
      const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
      nextEntry = { name, lines: end - start + 1, depth: 0 };
      found.push(nextEntry);
      next = [...chain, ownName(node)];
      nextDepth = 0;
    } else if (CLASS_KINDS.has(node.kind) && node.name) {
      next = [...chain, node.name.getText()];
    } else if (entry && opensNestingLevel(node)) {
      nextDepth = depth + 1;
      if (nextDepth > entry.depth) entry.depth = nextDepth;
    }
    ts.forEachChild(node, (child) => visit(child, next, nextEntry, nextDepth));
  };
  visit(sf, [], null, 0);
  const seen = new Map();
  const functions = found.map(({ name, lines, depth }) => {
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return { name: n === 1 ? name : `${name}~${n}`, lines, depth };
  });
  return { fileLines, functions };
}

// The three ratchets: snapshot field, comparison kind, threshold name.
const TIERS = [
  ['fileLines', 'file', 'fileThreshold'],
  ['functionLines', 'function', 'functionThreshold'],
  ['nesting', 'nesting', 'nestingCap'],
];

// Pure: { [file]: measureSource() } -> the records worth keeping.
export function snapshot(measured, { fileThreshold, functionThreshold, nestingCap }) {
  const fileLines = {};
  const functionLines = {};
  const nesting = {};
  for (const [file, m] of Object.entries(measured)) {
    if (m.fileLines > fileThreshold) fileLines[file] = m.fileLines;
    for (const f of m.functions) {
      if (f.lines > functionThreshold) functionLines[`${file}#${f.name}`] = f.lines;
      if (f.depth > nestingCap) nesting[`${file}#${f.name}`] = f.depth;
    }
  }
  return { fileLines, functionLines, nesting };
}

// Pure: recorded vs current (both snapshot-shaped). A failure is a record that
// grew or an unrecorded entry over its threshold; `lowered` lists records that
// shrank (to a number) or fell away (to null).
export function compareSize(recorded, current, thresholds) {
  const failures = [];
  const lowered = [];
  for (const [field, kind, thresholdName] of TIERS) {
    const threshold = thresholds[thresholdName];
    const rec = recorded[field] ?? {};
    for (const [key, now] of Object.entries(current[field] ?? {})) {
      const was = rec[key] ?? threshold;
      if (now > was) failures.push({ key, kind, recorded: was, current: now });
    }
    for (const [key, was] of Object.entries(rec)) {
      const now = (current[field] ?? {})[key];
      if (now === undefined) lowered.push({ key, kind, from: was, to: null });
      else if (now < was) lowered.push({ key, kind, from: was, to: now });
    }
  }
  return { failures, lowered };
}

// Pure: the records to write after a clean run, or null when nothing may be
// written (a failure, or nothing lowered). Only lowered entries change.
export function nextRecords(recorded, current, thresholds) {
  const { failures, lowered } = compareSize(recorded, current, thresholds);
  if (failures.length > 0 || lowered.length === 0) return null;
  const next = Object.fromEntries(TIERS.map(([field]) => [field, { ...(recorded[field] ?? {}) }]));
  for (const l of lowered) {
    const field = TIERS.find(([, kind]) => kind === l.kind)[0];
    if (l.to === null) delete next[field][l.key];
    else next[field][l.key] = l.to;
  }
  return next;
}

// The JSON sections: "size" keeps the file tier, "functionSize" and "nesting" are
// top-level so check-ratchet-raises treats their first baseline as new.
function toSections(limits, thresholds, rec) {
  return {
    ...limits,
    size: { ...limits.size, fileLines: rec.fileLines, fileThreshold: thresholds.fileThreshold },
    functionSize: { threshold: thresholds.functionThreshold, functions: rec.functionLines },
    nesting: { cap: thresholds.nestingCap, functions: rec.nesting },
  };
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
  const thresholds = {
    fileThreshold: limits.size?.fileThreshold ?? 800,
    functionThreshold: limits.functionSize?.threshold ?? 150,
    nestingCap: limits.nesting?.cap ?? 4,
  };
  const current = snapshot(measureTree(), thresholds);
  const count = (field) => Object.keys(current[field]).length;
  const summary = `${count('fileLines')} files over ${thresholds.fileThreshold}, ${count('functionLines')} functions over ${thresholds.functionThreshold}, ${count('nesting')} functions nested past ${thresholds.nestingCap}`;

  if (args.includes('--init')) {
    const sections = toSections(limits, thresholds, current);
    delete sections.size.functionThreshold;
    delete sections.size.functionLines;
    writeRatchetLimits(sections, root);
    console.log(`size-ratchet: recorded ${summary}.`);
    return 0;
  }

  const recorded = {
    fileLines: limits.size?.fileLines ?? {},
    functionLines: limits.functionSize?.functions ?? {},
    nesting: limits.nesting?.functions ?? {},
  };
  const { failures, lowered } = compareSize(recorded, current, thresholds);

  if (lowered.length > 0) {
    const lines = lowered.map((l) => `  ${l.kind} ${l.key}: ${l.from} -> ${l.to ?? 'under the threshold (record dropped)'}`);
    if (process.env.CI) {
      console.log(`size-ratchet: ${lowered.length} record(s) can be lowered (run it locally to rewrite scripts/ratchet-limits.json):\n${lines.join('\n')}`);
    } else {
      const next = nextRecords(recorded, current, thresholds);
      if (next) writeRatchetLimits(toSections(limits, thresholds, next), root);
      console.log(`size-ratchet: ${next ? 'lowered' : 'would lower'} ${lowered.length} record(s)${next ? ' in scripts/ratchet-limits.json' : ' (nothing written while the run fails)'}:\n${lines.join('\n')}`);
    }
  }

  if (failures.length > 0) {
    console.error(`Size ratchet: ${failures.length} file(s)/function(s) grew past their record. Split the code instead of raising a record:`);
    for (const f of failures) console.error(`  ${f.kind} ${f.key}: ${f.recorded} -> ${f.current}${f.kind === 'nesting' ? ' levels' : ' lines'}`);
    return 1;
  }
  console.log(`size-ratchet: ok (${summary}).`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
