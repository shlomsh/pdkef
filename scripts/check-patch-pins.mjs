import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Every patches/<name>+<version>.patch (patch-package) names an exact version.
   The lockfile must hold that version and package.json must pin it exactly,
   or a minor bump skips or breaks the patch. */

export function parsePatchName(file) {
  const m = /^(.+)\+(\d[^+]*)\.patch$/.exec(file);
  if (!m) return null;
  return { name: m[1].replace('+', '/'), version: m[2] };
}

export function checkPatchPins(files, lock, pkg) {
  const errors = [];
  for (const file of files) {
    const parsed = parsePatchName(file);
    if (!parsed) {
      errors.push(`${file}: cannot parse package name and version`);
      continue;
    }
    const { name, version } = parsed;
    const locked = lock.packages?.[`node_modules/${name}`]?.version;
    if (locked !== version) {
      errors.push(`${file}: package-lock.json has ${name}@${locked ?? 'nothing'}, the patch is for ${version}`);
    }
    const spec = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
    if (spec !== version) {
      errors.push(`${file}: package.json has "${name}": "${spec}", it must be exactly "${version}"`);
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(import.meta.url), '..', '..');
  const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
  const files = readdirSync(join(root, 'patches')).filter((f) => f.endsWith('.patch'));
  const errors = checkPatchPins(files, read('package-lock.json'), read('package.json'));
  for (const e of errors) console.error(e);
  if (errors.length) {
    console.error(`FAIL: ${errors.length} patch pin problem(s)`);
    process.exit(1);
  }
  console.log(`PASS: ${files.length} patch file(s) match the lockfile and are pinned exactly`);
}
