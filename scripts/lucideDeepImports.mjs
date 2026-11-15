import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/*
 * DEBT-76: `lucide-preact` exports only `.`, so `import { Undo2 } from 'lucide-preact'` makes the barrel a
 * module every island reaches, and every icon module under it counts as reached by all of them: the split rules
 * in astro.config.mjs then put every icon any tool uses into the shared `ui` chunk that /open/ preloads. This
 * rewrites a named import from the barrel into one default import per icon file, so the module graph shows who
 * really uses which icon and an icon only one tool imports rides in that tool's bundle.
 *
 * Build only (dev keeps the optimised barrel). Names with no default-export file of their own (`icons`,
 * `LucideProvider`, `useLucideContext`) stay on the barrel import.
 */

// Every `default as X` re-export: the icons, and `createLucideIcon` and `Icon`. One importer left on the barrel
// would be enough to undo this, since the barrel's `icons` namespace imports every icon file.
const BARREL_NAME = /^\s*export \{ ([^}]+) \} from '\.\/([\w/-]+\.mjs)';$/;

/** Exported name -> absolute icon file, read from the package's own barrel. */
export function readIconMap(root = process.cwd()) {
  const require = createRequire(path.join(path.resolve(root), 'package.json'));
  // The package's exports map names the CJS file for require(); the ESM barrel sits beside it.
  const dir = path.join(path.dirname(require.resolve('lucide-preact')), '..', 'esm');
  const barrel = path.join(dir, 'lucide-preact.mjs');
  const map = new Map();
  for (const line of fs.readFileSync(barrel, 'utf8').split('\n')) {
    const m = BARREL_NAME.exec(line);
    if (!m) continue;
    for (const part of m[1].split(',')) {
      const alias = /default as (\w+)/.exec(part)?.[1];
      if (alias) map.set(alias, path.join(dir, m[2]));
    }
  }
  return map;
}

const IMPORT = /import\s*\{([^}]*)\}\s*from\s*(['"])lucide-preact\2;?/g;

/** Returns the rewritten code, or null when nothing in it needs rewriting. */
export function rewriteLucideImports(code, iconMap) {
  if (!code.includes('lucide-preact')) return null;
  let changed = false;
  const out = code.replace(IMPORT, (whole, names) => {
    const kept = [];
    const lines = [];
    for (const raw of names.split(',')) {
      const spec = raw.trim();
      if (!spec) continue;
      const [imported, local = imported] = spec.split(/\s+as\s+/);
      const file = iconMap.get(imported);
      if (file && !/^type\s/.test(spec)) lines.push(`import ${local} from ${JSON.stringify(file)};`);
      else kept.push(spec);
    }
    if (lines.length === 0) return whole;
    changed = true;
    if (kept.length > 0) lines.push(`import { ${kept.join(', ')} } from 'lucide-preact';`);
    return lines.join('\n');
  });
  return changed ? out : null;
}

export function lucideDeepImports() {
  let iconMap;
  return {
    name: 'pdkef:lucide-deep-imports',
    apply: 'build',
    enforce: 'post',
    transform(code, id) {
      if (id.includes('node_modules') || !/\.[jt]sx?$/.test(id.split('?')[0])) return null;
      iconMap ??= readIconMap();
      const result = rewriteLucideImports(code, iconMap);
      return result === null ? null : { code: result, map: null };
    },
  };
}
