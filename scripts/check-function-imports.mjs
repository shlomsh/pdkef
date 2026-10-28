#!/usr/bin/env node
// Vercel Functions (api/*.ts, middleware.ts) are compiled per file and traced from their imports; the
// build does not resolve the `#lib/` package-imports aliases and cannot load a `.ts` specifier at run
// time. ARCH-44 aliased the store imports behind api/report.ts and the function crashed on every request
// with ERR_MODULE_NOT_FOUND for six hours, while every check stayed green. So everything reachable from a
// function entry imports relatively and names its file with `.js`, the form that deployed before ARCH-44.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, importSpecifiers, isLocalSpecifier, relOf, resolveRelativeImport } from './import-graph.mjs';

export const FUNCTION_ENTRIES = ['middleware.ts'];

/** Pure. The reasons one specifier cannot be loaded inside a deployed function (null when it can). */
export function functionImportProblem(specifier) {
  if (specifier.startsWith('#')) return 'an alias: the function build does not resolve it, import relatively';
  if (!specifier.startsWith('.')) return null; // bare package or node: builtin
  if (/\.tsx?$/.test(specifier)) return 'a .ts specifier: the function loads the compiled file, name it .js';
  if (!path.extname(specifier)) return 'no extension: Node ESM needs the .js';
  return null;
}

/** Pure. @returns {{file: string, specifier: string, reason: string}[]} */
export function findFunctionImportViolations(fromRel, specifiers) {
  const out = [];
  for (const specifier of specifiers) {
    const reason = functionImportProblem(specifier);
    if (reason) out.push({ file: fromRel, specifier, reason });
  }
  return out;
}

/** Every repo file a function entry reaches through local imports, entries included (repo-relative). */
export function functionFiles(entries = functionEntries()) {
  const seen = new Set();
  const queue = entries.map((e) => path.join(REPO_ROOT, e));
  while (queue.length) {
    const file = queue.pop();
    const rel = relOf(file);
    if (seen.has(rel)) continue;
    seen.add(rel);
    for (const specifier of importSpecifiers(fs.readFileSync(file, 'utf8'), rel)) {
      if (!isLocalSpecifier(specifier)) continue;
      const resolved = resolveRelativeImport(file, specifier);
      if (resolved && /\.[cm]?[jt]sx?$/.test(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

export function functionEntries() {
  const api = fs.readdirSync(path.join(REPO_ROOT, 'api')).filter((f) => /\.[jt]s$/.test(f));
  return [...api.map((f) => `api/${f}`), ...FUNCTION_ENTRIES];
}

function main() {
  const files = functionFiles();
  const violations = [];
  for (const rel of files) {
    const source = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    violations.push(...findFunctionImportViolations(rel, importSpecifiers(source, rel)));
  }
  if (violations.length) {
    for (const v of violations) console.error(`${v.file}: ${v.specifier} (${v.reason})`);
    console.error(`function-imports: ${violations.length} violation(s). Everything an api/ function or middleware.ts reaches imports relatively with .js (see the header of scripts/check-function-imports.mjs).`);
    process.exit(1);
  }
  console.log(`function-imports: ok (${files.size} files)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
