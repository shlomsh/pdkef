#!/usr/bin/env node
// ARCH-81: every pure module has a test that references it. A candidate is a non-test .js/.ts file
// under src/lib, src/editor or src/tools/<tool> (not .tsx/.jsx/.d.ts, not under e2e/ or __fixtures__/,
// not a use* hook). It is referenced when a sibling <stem>.test.<ext> exists or any test file under
// src/ or scripts/ imports it directly. scripts/untested-modules.json lists the unreferenced ones
// that exist today; the list only shrinks.
//
//   node scripts/check-untested-modules.mjs           check
//   node scripts/check-untested-modules.mjs --init    write the current unreferenced set
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, TEST_FILE, collectSourceFiles, importSpecifiers, relOf, resolveRelativeImport } from './import-graph.mjs';

const ALLOWLIST_PATH = path.join(REPO_ROOT, 'scripts', 'untested-modules.json');
const LAYER = /^src\/(?:lib|editor|tools\/[^/]+)\//;

// Pure: a repo-relative path -> is it a module that should be tested.
export function isCandidate(rel) {
  const base = path.posix.basename(rel);
  if (!/\.[jt]s$/.test(base) || /\.d\.ts$/.test(base) || TEST_FILE.test(base)) return false;
  if (!LAYER.test(rel)) return false;
  if (rel.split('/').some((part) => part === 'e2e' || part === '__fixtures__')) return false;
  return !/^use[A-Z]/.test(base);
}

const walk = (root, dir, opts) => {
  const abs = path.join(root, dir);
  return fs.existsSync(abs) ? collectSourceFiles(abs, [], opts) : [];
};

// A module whose every export is a type or interface has no runtime code for a test to exercise.
export function isTypeOnly(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const exports = code.match(/^\s*export\s+\S+/gm) ?? [];
  return exports.length > 0 && exports.every((e) => /export\s+(type|interface)\b/.test(e));
}

// Every candidate on disk with whether a test references it; reads the tree under `root`.
function referencedCandidates(root) {
  const candidates = walk(root, 'src', {})
    .map((f) => relOf(f, root))
    .filter((rel) => isCandidate(rel) && !isTypeOnly(fs.readFileSync(path.join(root, rel), 'utf8')));
  const imported = new Set();
  for (const test of [...walk(root, 'src', { testFiles: true }), ...walk(root, 'scripts', { testFiles: true })]) {
    for (const specifier of importSpecifiers(fs.readFileSync(test, 'utf8'), test)) {
      const target = resolveRelativeImport(test, specifier, root);
      if (target) imported.add(relOf(target, root));
    }
  }
  return candidates.map((rel) => {
    const ext = path.posix.extname(rel);
    const sibling = rel.slice(0, -ext.length) + '.test' + ext;
    return { rel, referenced: imported.has(rel) || fs.existsSync(path.join(root, sibling)) };
  });
}

// -> [{ file, reason }]
export function findUntestedModuleProblems(root, allowlist) {
  const found = referencedCandidates(root);
  const listed = new Set(allowlist);
  const problems = [];
  for (const { rel, referenced } of found) {
    if (!referenced && !listed.has(rel)) problems.push({ file: rel, reason: 'no test references it: write a test for it' });
    if (referenced && listed.has(rel)) problems.push({ file: rel, reason: 'allowlisted but now referenced: remove it from the allowlist' });
  }
  const existing = new Set(found.map((f) => f.rel));
  for (const rel of allowlist) {
    if (!existing.has(rel)) problems.push({ file: rel, reason: 'allowlisted but no longer a candidate (gone, moved or type-only): remove it from the allowlist' });
  }
  return problems.sort((a, b) => a.file.localeCompare(b.file));
}

function main(args) {
  if (args.includes('--init')) {
    const list = referencedCandidates(REPO_ROOT).filter((f) => !f.referenced).map((f) => f.rel).sort();
    fs.writeFileSync(ALLOWLIST_PATH, JSON.stringify(list, null, 2) + '\n');
    console.log(`check-untested-modules: wrote ${list.length} entries`);
    return 0;
  }
  const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const problems = findUntestedModuleProblems(REPO_ROOT, allowlist);
  for (const p of problems) console.error(`${p.file}: ${p.reason}`);
  console.log(problems.length ? `check-untested-modules: FAIL (${problems.length})` : `check-untested-modules: PASS (${allowlist.length} allowlisted)`);
  return problems.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
