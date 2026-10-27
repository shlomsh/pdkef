// Island-boundary guard (ARCH-97): every component an .astro file hydrates with a `client:*`
// directive must default-export `withIslandBoundary(...)` (src/lib/IslandErrorBoundary.tsx), so a
// render error in any island is reported and the window error handlers are installed (ARCH-72).
// An island added without the wrapper shipped once; this makes that a red check instead.
//
// Pure core: findUnwrappedIslands({ file, text, read }) with read(repoRelativePath) -> text | null.
import { readFileSync, globSync } from 'node:fs';
import { dirname, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSIONS = ['', '.tsx', '.ts', '.jsx', '.js'];
const WRAPPED = /export\s+default\s+withIslandBoundary\s*\(/;

const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

// Component names that carry a client:* directive, in tag order.
export function islandsIn(text) {
  const names = [];
  for (const m of stripComments(text).matchAll(/<([A-Z]\w*)\b[^>]*?\sclient:\w+/g)) names.push(m[1]);
  return names;
}

function importPath(text, name) {
  return stripComments(text).match(new RegExp(`import\\s+${name}\\s+from\\s+['"]([^'"]+)['"]`))?.[1] ?? null;
}

export function findUnwrappedIslands({ file, text, read }) {
  const problems = [];
  for (const island of new Set(islandsIn(text))) {
    const spec = importPath(text, island);
    const base = spec?.startsWith('.') ? posix.join(posix.dirname(file), spec) : null;
    const source = base === null ? null : EXTENSIONS.map((ext) => read(base + ext)).find((s) => s !== null && s !== undefined) ?? null;
    if (source === null) problems.push({ file, island, reason: 'cannot resolve the island import' });
    else if (!WRAPPED.test(source)) problems.push({ file, island, reason: 'default export is not withIslandBoundary(...)' });
  }
  return problems;
}

export function scanRepo(root) {
  const read = (p) => {
    try {
      return readFileSync(resolve(root, p), 'utf8');
    } catch {
      return null; // a missing path or a directory: not this extension
    }
  };
  return globSync('src/**/*.astro', { cwd: root }).flatMap((file) => findUnwrappedIslands({ file, text: read(file), read }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = scanRepo(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  for (const p of problems) console.error(`${p.file}: island ${p.island}: ${p.reason}`);
  console.log(problems.length ? `${problems.length} unwrapped island(s)` : 'Island boundaries OK');
  process.exit(problems.length ? 1 : 0);
}
