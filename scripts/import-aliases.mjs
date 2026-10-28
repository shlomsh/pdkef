import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ARCH-44: imports across layers use one alias per layer (`#lib/`, `#editor/`, `#editor-ui/`, `#shell/`),
// declared once in package.json "imports", which Node, Vite, Vitest (vi.mock too), TypeScript and Nx read
// natively. An aliased specifier always names the file with its real extension (TypeScript does not probe
// extensions behind an "imports" pattern). Every script that resolves imports itself maps a `#` specifier
// through aliasTarget first, then resolves the repo path as it resolves a relative one.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @testSeam @returns {Map<string, string>} '#lib/' -> 'src/lib/', in package.json order. */
export function readImportAliases(packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))) {
  const aliases = new Map();
  for (const [key, target] of Object.entries(packageJson.imports ?? {})) {
    if (!key.endsWith('/*') || typeof target !== 'string' || !target.endsWith('/*')) continue;
    aliases.set(key.slice(0, -1), target.replace(/^\.\//, '').slice(0, -1));
  }
  return aliases;
}

export const IMPORT_ALIASES = readImportAliases();

/** Pure. '#lib/pdf/openPdfDoc.ts' -> 'src/lib/pdf/openPdfDoc.ts' (repo-relative, forward slashes); null when no alias applies. */
export function aliasTarget(specifier, aliases = IMPORT_ALIASES) {
  for (const [prefix, dir] of aliases) {
    if (specifier.startsWith(prefix)) return dir + specifier.slice(prefix.length);
  }
  return null;
}
