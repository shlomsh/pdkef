#!/usr/bin/env node
// ARCH-44: imports across layers (src/lib, src/editor, src/editor-ui, src/shell) use one alias per layer
// (`#lib/...`) naming the file with its real extension; imports inside a layer stay relative. The alias
// table lives in scripts/import-aliases.mjs and the rule in docs/module-boundaries.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMPORT_ALIASES, aliasTarget } from './import-aliases.mjs';
import { REPO_ROOT, TEST_FILE, collectSourceFiles, importSpecifiers, resolveRelativeImport, relOf } from './import-graph.mjs';

const layerOf = (rel) => {
  for (const dir of IMPORT_ALIASES.values()) if (rel.startsWith(dir)) return dir;
  return null;
};
const aliasOf = (dir) => [...IMPORT_ALIASES].find(([, d]) => d === dir)[0];

/**
 * Pure. @param {string} fromRel repo-relative importer
 * @param {string[]} specifiers
 * @param {{resolveRel: (spec: string) => string|null, exists: (rel: string) => boolean}} io
 * @returns {{file: string, specifier: string, reason: string}[]}
 */
export function findAliasViolations(fromRel, specifiers, { resolveRel, exists }) {
  if (/(?:^|\/)e2e\//.test(fromRel)) return [];
  const own = layerOf(fromRel);
  const out = [];
  for (const specifier of specifiers) {
    if (specifier.includes('?')) continue;
    const add = (reason) => out.push({ file: fromRel, specifier, reason });
    const mapped = aliasTarget(specifier);
    if (mapped !== null) {
      if (!exists(mapped)) add('no such file: name it with its real extension');
      else if (layerOf(mapped) === own) add('same layer: use a relative path');
    } else if (specifier.startsWith('.')) {
      const target = resolveRel(specifier);
      const layer = target ? layerOf(target) : null;
      if (layer && layer !== own) add(`use the alias ${aliasOf(layer)}`);
      else if (!TEST_FILE.test(fromRel) && /^(?:\.\.\/){4,}/.test(specifier)) add('climbs four or more folders: use an alias');
    }
  }
  return out;
}

const VI_CALL = /\bvi\.(?:mock|doMock|unmock|importActual|importMock)\s*\(\s*(['"`])([^'"`\n]+)\1/g;

function main() {
  const src = path.join(REPO_ROOT, 'src');
  const files = [...collectSourceFiles(src), ...collectSourceFiles(src, [], { testFiles: true })];
  const violations = [];
  for (const abs of files) {
    const rel = relOf(abs);
    const source = fs.readFileSync(abs, 'utf8');
    const specs = importSpecifiers(source, rel);
    for (const m of source.matchAll(VI_CALL)) specs.push(m[2]);
    violations.push(
      ...findAliasViolations(rel, specs, {
        resolveRel: (s) => {
          const r = resolveRelativeImport(abs, s);
          return r ? relOf(r) : null;
        },
        exists: (p) => fs.existsSync(path.join(REPO_ROOT, p)) && fs.statSync(path.join(REPO_ROOT, p)).isFile(),
      }),
    );
  }
  if (violations.length) {
    for (const v of violations) console.error(`${v.file}: ${v.specifier} (${v.reason})`);
    console.error(`import-aliases: ${violations.length} violation(s). The rule is in docs/module-boundaries.md (ARCH-44).`);
    process.exit(1);
  }
  console.log(`import-aliases: ok (${files.length} files)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
