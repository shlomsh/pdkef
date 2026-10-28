#!/usr/bin/env node
// QUAL-41: every file a spec reads DIRECTLY (readFileSync, new URL(..., import.meta.url), setInputFiles, ...)
// must be covered by a scope rule. Nx and vitest follow imports, not file reads, so such a spec is only
// selected when the target's change widens or the spec's own project is affected. This guard finds the
// statically resolvable reads and asks the real oracles (selectUnitTests, deriveScope) whether a change to
// the target would run the reading spec. Dynamic reads are counted as `unresolved`, never failures.
//
//   node scripts/check-spec-file-reads.mjs            exit 1 and list each uncovered pair
//   node scripts/check-spec-file-reads.mjs --report   list every pair with its reason, never fail
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { posix, join, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectUnitTests } from './unit-scope.mjs';
import { isDocsOnly } from './change-scope.mjs';
import { deriveScope, ownerOf, siteE2eProjectList, makeToolOf, toolNameOf } from './affected-scope.mjs';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const R = '/R'; // virtual repo root while evaluating path expressions

// ---------------------------------------------------------------------------
// Scanner: a small expression evaluator for path arguments.

const READERS = ['readFileSync', 'readFile', 'readdirSync', 'readdir', 'existsSync', 'statSync', 'createReadStream', 'setInputFiles'];
const READ_CALL = new RegExp(`\\b(${READERS.join('|')})\\s*\\(`, 'g');
const ROOT_NAMES = new Set(['ROOT', 'REPO', 'REPO_ROOT', 'repoRoot', 'root', 'repo']);
const SOURCE_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.astro', '.json'];
const IDENT = /[A-Za-z_$][\w$]*/y;

const isUrl = (v) => v.startsWith('url:');
const stripUrl = (v) => (isUrl(v) ? v.slice(4) : v);
const absolute = (v) => (stripUrl(v).startsWith('/') ? stripUrl(v) : posix.join(R, stripUrl(v)));

function skipWs(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

// Evaluates path-ish expressions: literals, templates, + concatenation, join/resolve/dirname/
// fileURLToPath, new URL(rel, base), import.meta.url/dirname, __dirname, process.cwd() and constants
// declared in the same file. Returns { v, i } or null when any piece is not static.
function makeEvaluator(spec, text) {
  const declared = new Map();
  for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g)) {
    if (!declared.has(m[1])) declared.set(m[1], m.index + m[0].length);
  }
  const memo = new Map();
  const specDir = posix.join(R, posix.dirname(spec));

  function lookup(name, depth) {
    if (memo.has(name)) return memo.get(name);
    let v = null;
    if (declared.has(name) && depth < 8) {
      memo.set(name, null); // cycle guard
      const r = expr(declared.get(name), depth + 1);
      v = r ? r.v : null;
    }
    if (v === null) {
      if (name === '__dirname') v = specDir;
      else if (name === '__filename') v = posix.join(R, spec);
      else if (ROOT_NAMES.has(name) && !declared.has(name)) v = R;
    }
    memo.set(name, v);
    return v;
  }

  function args(i, depth) {
    const out = [];
    i = skipWs(text, i);
    if (text[i] === ')') return { out, i: i + 1 };
    for (;;) {
      const r = expr(i, depth);
      if (!r) return null;
      out.push(r.v);
      i = skipWs(text, r.i);
      if (text[i] === ',') {
        i = skipWs(text, i + 1);
        if (text[i] === ')') return { out, i: i + 1 };
        continue;
      }
      if (text[i] === ')') return { out, i: i + 1 };
      return null;
    }
  }

  function template(i, depth) {
    let v = '';
    i++;
    while (i < text.length && text[i] !== '`') {
      if (text[i] === '\\') { v += text[i + 1]; i += 2; continue; }
      if (text[i] === '$' && text[i + 1] === '{') {
        const r = expr(i + 2, depth);
        if (!r) return null;
        const j = skipWs(text, r.i);
        if (text[j] !== '}') return null;
        v += stripUrl(r.v);
        i = j + 1;
        continue;
      }
      v += text[i++];
    }
    return text[i] === '`' ? { v, i: i + 1 } : null;
  }

  function primary(i, depth) {
    i = skipWs(text, i);
    const c = text[i];
    if (c === "'" || c === '"') {
      let v = '';
      let j = i + 1;
      while (j < text.length && text[j] !== c) {
        if (text[j] === '\\') { v += text[j + 1]; j += 2; continue; }
        if (text[j] === '\n') return null;
        v += text[j++];
      }
      return text[j] === c ? { v, i: j + 1 } : null;
    }
    if (c === '`') return template(i, depth);
    if (text.startsWith('new URL', i)) {
      const a = args(skipWs(text, i + 7) + 1, depth);
      if (!a || a.out.length < 2) return null;
      const base = a.out[1];
      if (!isUrl(base)) return null;
      return { v: `url:${posix.resolve(posix.dirname(stripUrl(base)), stripUrl(a.out[0]))}`, i: a.i };
    }
    if (text.startsWith('import.meta.url', i)) return { v: `url:${posix.join(R, spec)}`, i: i + 15 };
    if (text.startsWith('import.meta.dirname', i)) return { v: specDir, i: i + 19 };
    if (text.startsWith('process.cwd()', i)) return { v: R, i: i + 13 };
    IDENT.lastIndex = i;
    const m = IDENT.exec(text);
    if (!m) return null;
    let j = i + m[0].length;
    let name = m[0];
    // path.join / posix.join style: take the last segment of a dotted callee
    while (text[j] === '.' && /[A-Za-z_$]/.test(text[j + 1] ?? '')) {
      IDENT.lastIndex = j + 1;
      const n = IDENT.exec(text);
      if (!n) break;
      const next = j + 1 + n[0].length;
      if (n[0] === 'pathname' || n[0] === 'href') {
        const base = lookup(name, depth);
        return base === null ? null : { v: stripUrl(base), i: next };
      }
      name = n[0];
      j = next;
    }
    if (text[j] === '(') {
      const a = args(j + 1, depth);
      if (!a) return null;
      const parts = a.out.map(stripUrl);
      if (name === 'join') return { v: posix.join(...parts), i: a.i };
      if (name === 'resolve') return { v: posix.resolve(R, ...parts), i: a.i };
      if (name === 'dirname' && parts.length === 1) return { v: posix.dirname(parts[0]), i: a.i };
      if (name === 'fileURLToPath' && parts.length === 1) return { v: parts[0], i: a.i };
      return null;
    }
    const v = lookup(name, depth);
    return v === null ? null : { v, i: j };
  }

  function expr(i, depth = 0) {
    let r = primary(i, depth);
    if (!r) return null;
    for (;;) {
      const j = skipWs(text, r.i);
      if (text[j] !== '+') return r;
      const next = primary(j + 1, depth);
      if (!next) return null;
      r = { v: stripUrl(r.v) + stripUrl(next.v), i: next.i };
    }
  }

  return { expr, args };
}

// The repo-relative path an evaluated value names, or null when it leaves the repo.
function toRepoRelative(v) {
  const abs = posix.normalize(absolute(v));
  if (abs === R || !abs.startsWith(`${R}/`)) return null;
  return abs.slice(R.length + 1);
}

function importedCandidates(spec, text) {
  const out = new Set();
  const dir = posix.dirname(spec);
  for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"](\.[^'"]*)['"]/g)) {
    const base = posix.join(dir, m[1].replace(/\?.*$/, ''));
    for (const ext of SOURCE_EXTS) {
      out.add(base + ext);
      out.add(`${base}/index${ext}`);
    }
  }
  return out;
}

export function readTargetsOf({ spec, text, resolveExisting }) {
  const { expr, args } = makeEvaluator(spec, text);
  const raw = new Set();
  let unresolved = 0;

  // new URL('<rel>', import.meta.url) anywhere (fetch-free asset references, readFileSync args).
  for (const m of text.matchAll(/new URL\s*\(/g)) {
    const r = expr(m.index, 0);
    if (r && isUrl(r.v)) raw.add(r.v);
  }

  READ_CALL.lastIndex = 0;
  for (const m of text.matchAll(READ_CALL)) {
    const start = m.index + m[0].length;
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (/function\s+$|=>\s*$/.test(before)) continue;
    let i = skipWs(text, start);
    const values = [];
    let ok = true;
    if (text[i] === '[') {
      // setInputFiles([a, b]): each element
      i++;
      for (;;) {
        i = skipWs(text, i);
        if (text[i] === ']') break;
        const r = expr(i, 0);
        if (!r) { ok = false; break; }
        values.push(r.v);
        i = skipWs(text, r.i);
        if (text[i] === ',') i++;
        else if (text[i] !== ']') { ok = false; break; }
      }
    } else {
      const r = expr(i, 0);
      if (!r) ok = false;
      else values.push(r.v);
    }
    if (!ok) { unresolved++; continue; }
    for (const v of values) raw.add(v);
  }

  const imported = importedCandidates(spec, text);
  const targets = new Set();
  for (const v of raw) {
    const rel = toRepoRelative(v);
    if (!rel) continue;
    const found = resolveExisting(rel);
    if (!found || found === spec || imported.has(found.replace(/\/$/, ''))) continue;
    targets.add(found);
  }
  return { targets: [...targets].sort(), unresolved };
}

// ---------------------------------------------------------------------------
// Verdict.

// The export guards and the font guards are selected by the `export_guards` and `fonts` flags, not by
// e2e_paths (the product jobs skip them), so a spec in either set is covered by its own flag.
const FONT_GUARD_SPEC = /^e2e\/sign\/[^/]*-(guard|parity)\.spec\.js$/;

export function e2eCovers(scope, spec) {
  if (scope.everything) return true;
  if (scope.export_guards && spec.startsWith('e2e/export/')) return true;
  if (scope.fonts && FONT_GUARD_SPEC.test(spec)) return true;
  return String(scope.e2e_paths ?? '').split(/\s+/).filter(Boolean).some((p) => (p.endsWith('/') ? spec.startsWith(p) : spec === p));
}

export function affectedFrom(project, dependencies) {
  const dependents = new Map();
  for (const [source, edges] of Object.entries(dependencies)) {
    for (const edge of edges) {
      if (!dependents.has(edge.target)) dependents.set(edge.target, []);
      dependents.get(edge.target).push(source);
    }
  }
  const seen = new Set([project]);
  const queue = [project];
  while (queue.length) {
    for (const d of dependents.get(queue.pop()) ?? []) {
      if (!seen.has(d)) { seen.add(d); queue.push(d); }
    }
  }
  return [...seen];
}

// pairs: [{ spec, target, kind: 'unit' | 'e2e' }]. selectUnit(files) and deriveE2e(target) are the oracles.
export function coverageOf({ pairs, selectUnit, deriveE2e, isDocs = isDocsOnly }) {
  return pairs.map((pair) => {
    const { spec, target, kind } = pair;
    // A docs-only push runs no unit test or spec in CI (scripts/change-scope.mjs), so no rule can select
    // the spec. Reported, not failed: it is a property of the docs-only class, not a missing rule.
    if (isDocs(target)) return { ...pair, covered: true, docsOnly: true, reason: 'docs-only target: CI runs no test on a docs-only push' };
    if (kind === 'unit') {
      const sel = selectUnit([{ path: target, status: 'M' }]);
      if (sel.all) return { ...pair, covered: true, reason: `widens to the whole suite (${sel.reasons[0] ?? ''})` };
      if (sel.seeds.includes(spec)) return { ...pair, covered: true, reason: 'spec is a seed' };
      return { ...pair, covered: false, reason: 'no widen rule seeds this spec' };
    }
    const scope = deriveE2e(target);
    if (scope.everything) return { ...pair, covered: true, reason: `everything (${scope.reason ?? ''})` };
    if (e2eCovers(scope, spec)) return { ...pair, covered: true, reason: `e2e_paths: ${scope.e2e_paths}` };
    return { ...pair, covered: false, reason: `e2e_paths misses it (${scope.reason ?? scope.e2e_paths})` };
  });
}

// ---------------------------------------------------------------------------
// Impure: tracked files, the Nx graph (once), and the CLI.

// This guard's own test is left out: its fixtures are strings that name files it never reads.
const SELF_TEST = 'scripts/check-spec-file-reads.test.mjs';

export function classifySpecs(tracked) {
  const unit = tracked.filter((f) => f !== SELF_TEST && ((/^src\/.*\.(test|spec)\.(js|jsx|ts|tsx)$/.test(f) && !/^src\/tools\/[^/]+\/e2e\//.test(f)) || /^scripts\/.*\.test\.mjs$/.test(f)));
  const e2e = tracked.filter((f) => /^e2e\/.*\.spec\.[^/]+$/.test(f) || /^src\/tools\/[^/]+\/e2e\/.*\.spec\.[^/]+$/.test(f));
  return { unit, e2e };
}

function loadNxGraph() {
  const dir = mkdtempSync(join(tmpdir(), 'nx-graph-'));
  const file = join(dir, 'graph.json');
  try {
    execFileSync('npx', ['nx', 'graph', `--file=${file}`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, NX_DAEMON: 'false' } });
    const graph = JSON.parse(readFileSync(file, 'utf8'));
    return { nodes: graph.graph.nodes, dependencies: graph.graph.dependencies ?? graph.dependencies ?? {} };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function makeDeriveE2e() {
  const { nodes, dependencies } = loadNxGraph();
  const info = new Map(Object.entries(nodes).map(([name, node]) => [name, { root: node.data.root, tags: node.data.tags ?? [], implicitDependencies: node.data.implicitDependencies ?? [] }]));
  const roots = new Map([...info].map(([name, node]) => [name, node.root]));
  const children = readdirSync(join(ROOT, 'e2e'), { withFileTypes: true }).map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
  const siteE2eProjects = siteE2eProjectList(info, children);
  const { buildReachGraph } = await import('./import-graph.mjs');
  return (target) => {
    const owner = ownerOf(target, roots);
    const affected = owner ? affectedFrom(owner, dependencies) : [];
    return deriveScope({
      files: [target],
      affected,
      roots,
      toolE2eExists: (project) => existsSync(join(ROOT, `src/tools/${toolNameOf(project)}/e2e/`)),
      siteE2ePaths: siteE2eProjects.flatMap((p) => p.paths),
      siteE2eProjects,
      loadReachGraph: () => {
        const graph = buildReachGraph();
        return { knownFiles: graph.knownFiles, reverseEdges: graph.reverseEdges, toolOf: makeToolOf(graph.routeMap) };
      },
    });
  };
}

async function main(argv) {
  const started = Date.now();
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean);
  const files = new Set(tracked);
  const dirs = new Set();
  for (const f of tracked) {
    for (let d = posix.dirname(f); d !== '.' && !dirs.has(d); d = posix.dirname(d)) dirs.add(d);
  }
  const resolveExisting = (rel) => (files.has(rel) ? rel : dirs.has(rel.replace(/\/$/, '')) ? `${rel.replace(/\/$/, '')}/` : null);

  const { unit, e2e } = classifySpecs(tracked);
  const pairs = [];
  let unresolved = 0;
  const specs = new Set();
  for (const [kind, list] of [['unit', unit], ['e2e', e2e]]) {
    for (const spec of list) {
      const r = readTargetsOf({ spec, text: readFileSync(join(ROOT, spec), 'utf8'), resolveExisting });
      unresolved += r.unresolved;
      if (r.targets.length) specs.add(spec);
      for (const target of r.targets) pairs.push({ spec, target, kind });
    }
  }

  const deriveE2e = pairs.some((p) => p.kind === 'e2e') ? await makeDeriveE2e() : null;
  const results = coverageOf({
    pairs,
    selectUnit: (changed) => selectUnitTests({ files: changed, mode: 'ci', exists: (p) => files.has(p) }),
    deriveE2e,
  });

  const report = argv.includes('--report');
  const bad = results.filter((r) => !r.covered);
  if (report) {
    for (const r of results) console.log(`${r.covered ? 'covered  ' : 'UNCOVERED'}  ${r.spec}  reads  ${r.target}  (${r.kind})  ${r.reason}`);
  } else {
    for (const r of bad) console.log(`UNCOVERED  ${r.spec}  reads  ${r.target}  (${r.kind})`);
  }
  const docsOnly = results.filter((r) => r.docsOnly);
  if (docsOnly.length > 0) console.log(`docs-only reads (CI runs no test on a docs-only push): ${[...new Set(docsOnly.map((r) => r.target))].join(', ')}`);
  console.log(`spec file reads: ${pairs.length} pairs over ${specs.size} specs, ${unresolved} unresolved reads`);
  console.log(`(${((Date.now() - started) / 1000).toFixed(1)}s)`);
  return report || bad.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  process.exit(await main(process.argv.slice(2)));
}
