import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Config that belongs to the repo, not the site. Nx finds a project by its project.json, so
 * public/fonts/project.json has to sit beside the fonts it owns, and `public/` is copied verbatim
 * into dist/ and served. The build strips these after `astro build` (and before the precache
 * manifest hashes dist/fonts/); test:precache-budget fails if one is still there.
 */
const REPO_ONLY_NAMES = new Set(['project.json', 'package.json', 'tsconfig.json', 'nx.json']);

// Paths relative to `dir`, forward slashes, of every repo-only file under it.
export function findRepoOnlyFiles(dir) {
  const found = [];
  const walk = (current) => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (REPO_ONLY_NAMES.has(entry.name)) found.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return found;
}

export function pruneRepoOnlyFiles(dir) {
  const removed = findRepoOnlyFiles(dir);
  for (const f of removed) fs.rmSync(path.join(dir, f));
  return removed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const removed = pruneRepoOnlyFiles(dist);
  console.log(removed.length ? `Removed repo-only files from dist/: ${removed.join(', ')}` : 'No repo-only files in dist/.');
}
