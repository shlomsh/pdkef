#!/usr/bin/env node
// ARCH-61: unused exports are a ratchet that only shrinks. Every named or default export
// under src/ is classified by who reaches it, and three counts are recorded under
// "unusedExports" in scripts/ratchet-limits.json:
//
//   neverUsed    imported nowhere and not referenced in its own file
//   ownFileOnly  imported nowhere, but its own file uses it (the `export` keyword is surplus)
//   testOnly     imported only by test files (*.test.*, *.spec.*, e2e/, src/test/)
//
// The check fails when a count rises. A shrink passes; locally it also rewrites the record
// lower, in CI it only prints (ARCH-76's check-ratchet-raises refuses any raise of the record).
//
// Importers are every .ts/.tsx/.js/.jsx/.mjs/.astro file under src/, e2e/, scripts/, api/ plus
// middleware.ts and astro.config.mjs. An .astro file contributes its frontmatter, its inline
// <script> bodies and its <script src>. A namespace import, a dynamic import() and an
// `import('./x').T` type all count as using every export of the target. A re-export through a
// barrel is followed to the declaration; the barrel's own re-export line is not a use.
//
// Allowlist (never counted): src/pages/**, src/content.config.ts, api/**, middleware.ts,
// astro.config.mjs - the framework reads those exports by name.
//
// TEST-SEAM CONVENTION: an export that only tests need (a reset hook, an internal exposed
// so a unit test can reach it) is fine when its declaration carries a `/** @testSeam */`
// JSDoc tag. It is then not counted as testOnly. Without the tag it is.
//
//   node scripts/check-unused-exports.mjs          check (and lower the record outside CI)
//   node scripts/check-unused-exports.mjs --init   write the current counts
//   node scripts/check-unused-exports.mjs --list   print every symbol per category
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { aliasTarget } from './import-aliases.mjs';
import { readRatchetLimits, writeRatchetLimits } from './ratchet-limits.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.astro'];
const TEST_FILE = /\.(?:test|contract|spec)\.[cm]?[jt]sx?$/;
const KEYS = ['neverUsed', 'ownFileOnly', 'testOnly'];

const isTestPath = (p) => TEST_FILE.test(p) || p.startsWith('e2e/') || p.startsWith('src/test/') || p.includes('/e2e/');
const isAllowlisted = (p) => p.startsWith('src/pages/') || p === 'src/content.config.ts' || p.startsWith('api/') || p === 'middleware.ts' || p === 'astro.config.mjs';
const isCounted = (p) => p.startsWith('src/') && !p.endsWith('.astro') && !p.endsWith('.d.ts') && !isTestPath(p) && !isAllowlisted(p);

function resolveSpecifier(from, specifierRaw, files) {
  const specifier = specifierRaw.split('?')[0];
  const aliased = aliasTarget(specifier);
  if (!aliased && !specifier.startsWith('.')) return null;
  const base = aliased ?? path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  const ext = path.posix.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  const candidates = [base, ...EXTS.map((e) => stem + e), ...EXTS.map((e) => base + e), ...EXTS.map((e) => `${base}/index${e}`)];
  return candidates.find((c) => files.has(c)) ?? null;
}

// The chunks of a file worth parsing as code, each with a virtual file name for the parser.
function codeChunks(file, source) {
  if (!file.endsWith('.astro')) return { chunks: [[file, source]], scriptSrcs: [] };
  const chunks = [];
  const scriptSrcs = [];
  const front = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (front) chunks.push(['frontmatter.ts', front[1]]);
  for (const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = m[1].match(/\bsrc\s*=\s*["']([^"']+)["']/);
    if (src) scriptSrcs.push(src[1]);
    else chunks.push(['script.ts', m[2]]);
  }
  return { chunks, scriptSrcs };
}

const hasExportModifier = (n) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const hasDefaultModifier = (n) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

function bindingNames(name, out = []) {
  if (ts.isIdentifier(name)) out.push(name);
  else for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out);
  return out;
}

// Pure: one parsed file -> its declarations (exports), its imports and its re-exports.
function scanFile(file, source, files) {
  const { chunks, scriptSrcs } = codeChunks(file, source);
  const uses = []; // { target, name: string | '*' }
  const exportsOut = []; // { name, local, line, seam, declNode }
  const reexports = new Map(); // exported name -> { target, orig }
  const stars = []; // targets of `export * from`
  const identCounts = new Map();
  const declIdents = new Set();
  const addUse = (spec, name) => {
    const target = resolveSpecifier(file, spec, files);
    if (target && target !== file) uses.push({ target, name });
  };
  for (const s of scriptSrcs) addUse(s, '*');

  for (const [name, text] of chunks) {
    const sf = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, name.endsWith('x') ? ts.ScriptKind.TSX : undefined);
    const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    const seamOf = (n) => ts.getJSDocTags(n).some((t) => t.tagName.text === 'testSeam');
    const isModule = file.endsWith('.astro') ? false : true;

    const visit = (node) => {
      if (ts.isIdentifier(node) && !(node.parent && ts.isExportSpecifier(node.parent))) {
        identCounts.set(node.text, (identCounts.get(node.text) ?? 0) + 1);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        addUse(node.arguments[0].text, '*');
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    // `import('./x').T` also lives in JSDoc comments (`@typedef {import('./x.ts').T}`), which the
    // AST skips: read it from the text. `.T` is a named use; a bare import() or `.then` is a
    // use of every export of the target.
    for (const m of text.matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)(?:\.([A-Za-z_$][\w$]*))?/g)) {
      addUse(m[1], m[2] && !['then', 'catch', 'finally'].includes(m[2]) ? m[2] : '*');
    }

    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
        const spec = st.moduleSpecifier.text;
        const c = st.importClause;
        if (!c) { addUse(spec, '*'); continue; } // side-effect import: nothing named, but file is reached
        if (c.name) addUse(spec, 'default');
        if (c.namedBindings) {
          if (ts.isNamespaceImport(c.namedBindings)) addUse(spec, '*');
          else for (const el of c.namedBindings.elements) addUse(spec, (el.propertyName ?? el.name).text);
        }
        continue;
      }
      if (ts.isExportDeclaration(st)) {
        if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
          const spec = st.moduleSpecifier.text;
          const target = resolveSpecifier(file, spec, files);
          if (!target) continue;
          if (!st.exportClause) stars.push(target);
          else if (ts.isNamespaceExport(st.exportClause)) uses.push({ target, name: '*' });
          else for (const el of st.exportClause.elements) reexports.set(el.name.text, { target, orig: (el.propertyName ?? el.name).text });
        } else if (st.exportClause && ts.isNamedExports(st.exportClause)) {
          for (const el of st.exportClause.elements) exportsOut.push({ name: el.name.text, local: (el.propertyName ?? el.name).text, line: lineOf(el), seam: seamOf(st), viaSpecifier: true });
        }
        continue;
      }
      if (ts.isExportAssignment(st)) {
        exportsOut.push({ name: 'default', local: ts.isIdentifier(st.expression) ? st.expression.text : null, line: lineOf(st), seam: seamOf(st), viaSpecifier: false });
        continue;
      }
      // Collect declaration-name identifiers of every top-level declaration (exported or not).
      const declNames = [];
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) declNames.push(...bindingNames(d.name));
      else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) declNames.push(st.name);
      for (const n of declNames) declIdents.add(n);
      if (!isModule || !hasExportModifier(st)) continue;
      const isDefault = hasDefaultModifier(st);
      if (isDefault) {
        exportsOut.push({ name: 'default', local: declNames[0]?.text ?? null, line: lineOf(st), seam: seamOf(st), viaSpecifier: false });
      } else {
        const seen = new Set();
        for (const n of declNames) {
          if (seen.has(n.text)) continue; // function overloads
          seen.add(n.text);
          exportsOut.push({ name: n.text, local: n.text, line: lineOf(st), seam: seamOf(st), viaSpecifier: false });
        }
      }
    }
  }

  // Local use: identifiers spelled like the export, beyond its own declaration names.
  const declCounts = new Map();
  for (const n of declIdents) declCounts.set(n.text, (declCounts.get(n.text) ?? 0) + 1);
  for (const e of exportsOut) {
    e.usedLocally = e.local ? (identCounts.get(e.local) ?? 0) - (declCounts.get(e.local) ?? 0) > 0 : false;
  }
  return { uses, exportsOut, reexports, stars };
}

// Follow a name through re-exports to the file that declares it: [{ file, name }] or [].
function resolveDeclaration(scans, file, name, seen = new Set()) {
  const key = `${file}#${name}`;
  if (seen.has(key)) return [];
  seen.add(key);
  const scan = scans.get(file);
  if (!scan) return [];
  if (scan.exportsOut.some((e) => e.name === name)) return [{ file, name }];
  const re = scan.reexports.get(name);
  if (re) return resolveDeclaration(scans, re.target, re.orig, seen);
  if (name === 'default') return [];
  return scan.stars.flatMap((t) => resolveDeclaration(scans, t, name, seen));
}

function allDeclarations(scans, file, seen = new Set()) {
  if (seen.has(file)) return [];
  seen.add(file);
  const scan = scans.get(file);
  if (!scan) return [];
  return [
    ...scan.exportsOut.map((e) => ({ file, name: e.name })),
    ...[...scan.reexports.entries()].flatMap(([n, r]) => resolveDeclaration(scans, r.target, r.orig)),
    ...scan.stars.flatMap((t) => allDeclarations(scans, t, seen)),
  ];
}

// Pure: { repo-relative path: source } -> { neverUsed, ownFileOnly, testOnly }, each a sorted
// list of { file, name, line }.
export function analyzeExports(sources) {
  const files = new Set(Object.keys(sources));
  const scans = new Map();
  for (const [file, source] of Object.entries(sources)) scans.set(file, scanFile(file, source, files));

  const usedBy = new Map(); // `${file}#${name}` -> { nonTest: bool, test: bool }
  const mark = (decl, importer) => {
    const key = `${decl.file}#${decl.name}`;
    const m = usedBy.get(key) ?? { nonTest: false, test: false };
    if (isTestPath(importer)) m.test = true; else m.nonTest = true;
    usedBy.set(key, m);
  };
  for (const [importer, scan] of scans) {
    for (const u of scan.uses) {
      const decls = u.name === '*' ? allDeclarations(scans, u.target) : resolveDeclaration(scans, u.target, u.name);
      for (const d of decls) mark(d, importer);
    }
  }

  const result = { neverUsed: [], ownFileOnly: [], testOnly: [] };
  for (const [file, scan] of scans) {
    if (!isCounted(file)) continue;
    for (const e of scan.exportsOut) {
      const use = usedBy.get(`${file}#${e.name}`);
      if (use?.nonTest) continue;
      const entry = { file, name: e.name, line: e.line };
      if (use?.test) { if (!e.seam) result.testOnly.push(entry); }
      else if (e.usedLocally) result.ownFileOnly.push(entry);
      else if (!e.seam) result.neverUsed.push(entry);
    }
  }
  for (const k of KEYS) result[k].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name));
  return result;
}

const countsOf = (r) => Object.fromEntries(KEYS.map((k) => [k, r[k].length ?? r[k]]));

// Pure: recorded vs current counts. A failure is a count that rose.
export function compareUnused(recorded, current) {
  const failures = [];
  const lowered = [];
  for (const k of KEYS) {
    const was = recorded[k] ?? 0;
    if (current[k] > was) failures.push({ key: k, recorded: was, current: current[k] });
    else if (current[k] < was) lowered.push({ key: k, from: was, to: current[k] });
  }
  return { failures, lowered };
}

// Pure: the record to write after a clean run, or null when nothing may be written.
export function nextUnusedRecord(recorded, current) {
  const { failures, lowered } = compareUnused(recorded, current);
  if (failures.length > 0 || lowered.length === 0) return null;
  return Object.fromEntries(KEYS.map((k) => [k, Math.min(recorded[k] ?? 0, current[k])]));
}

function readTree() {
  const tracked = execFileSync('git', ['ls-files', 'src', 'e2e', 'scripts', 'api', 'middleware.ts', 'astro.config.mjs'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter((f) => f && EXTS.includes(path.extname(f)) && fs.existsSync(path.join(root, f)));
  return Object.fromEntries(tracked.map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')]));
}

function main(args) {
  const result = analyzeExports(readTree());
  const current = countsOf(result);
  const limits = readRatchetLimits(root);

  if (args.includes('--list')) {
    for (const k of KEYS) {
      console.log(`\n${k} (${result[k].length})`);
      for (const e of result[k]) console.log(`  ${e.file}:${e.line} ${e.name}`);
    }
    return 0;
  }
  if (args.includes('--init')) {
    writeRatchetLimits({ ...limits, unusedExports: current }, root);
    console.log(`unused-exports: recorded ${JSON.stringify(current)}.`);
    return 0;
  }

  const recorded = limits.unusedExports ?? { neverUsed: 0, ownFileOnly: 0, testOnly: 0 };
  const { failures, lowered } = compareUnused(recorded, current);
  if (lowered.length > 0) {
    const lines = lowered.map((l) => `  ${l.key}: ${l.from} -> ${l.to}`);
    if (process.env.CI) {
      console.log(`unused-exports: ${lowered.length} record(s) can be lowered (run it locally to rewrite scripts/ratchet-limits.json):\n${lines.join('\n')}`);
    } else {
      const next = nextUnusedRecord(recorded, current);
      if (next) writeRatchetLimits({ ...limits, unusedExports: next }, root);
      console.log(`unused-exports: ${next ? 'lowered' : 'would lower'} ${lowered.length} record(s)${next ? ' in scripts/ratchet-limits.json' : ' (nothing written while the run fails)'}:\n${lines.join('\n')}`);
    }
  }
  if (failures.length > 0) {
    console.error('Unused exports: a count rose past its record. Drop the `export`, delete the symbol, or tag a test-only seam with /** @testSeam */:');
    for (const f of failures) console.error(`  ${f.key}: ${f.recorded} -> ${f.current}  (list them: node scripts/check-unused-exports.mjs --list)`);
    return 1;
  }
  console.log(`unused-exports: ok (${JSON.stringify(current)}).`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
