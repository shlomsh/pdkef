// MEM-42: every board on every page must point at a flag sprite the build really wrote.
// Run inside `npm run build`, so a build whose pages name a sprite that is not in dist fails
// and the previous deployment stays live (on 2026-11-12 each board named a sprite made from
// its own notes while one file was written from all of them, and the flags went 404).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPRITE_REF = /\/flags\/notes-[0-9a-f]+\.svg/g;

/** Pure: the sprite URLs the pages name, and which of them the build did not write. */
export function findSpriteProblems(pages, hasFile) {
  const named = new Map();
  for (const { path, html } of pages) {
    for (const url of new Set(html.match(SPRITE_REF) ?? [])) named.set(url, [...(named.get(url) ?? []), path]);
  }
  const problems = [];
  for (const [url, paths] of named) {
    if (!hasFile(url)) problems.push(`${url} is named by ${paths.length} page(s) (${paths.slice(0, 3).join(', ')}) and is not in dist`);
  }
  if (named.size > 1) problems.push(`pages name ${named.size} different sprites (${[...named.keys()].join(', ')}): every board must share one`);
  return { sprites: [...named.keys()], problems };
}

function htmlFiles(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) htmlFiles(full, base, out);
    else if (name.endsWith('.html')) out.push({ path: full.slice(base.length), html: readFileSync(full, 'utf8') });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = join(process.cwd(), 'dist');
  const { sprites, problems } = findSpriteProblems(htmlFiles(dist), (url) => existsSync(join(dist, url)));
  if (problems.length > 0) {
    console.error(`Flag sprite check failed:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`Flag sprite check passed: ${sprites.length === 0 ? 'no board names a sprite' : `${sprites[0]} is in dist and shared by every board`}.`);
}
