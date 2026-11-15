import fs from 'node:fs';
import path from 'node:path';
import { readIconMap } from './lucideDeepImports.mjs';

/*
 * DEBT-76: which lucide icons the shared `ui` chunk carries and which source files import each. /shared/ui.js is
 * on every page with an island, /open/ included, so an icon only one tool imports must never be in it (the
 * lucide deep-import plugin keeps it in that tool's bundle). check-precache-budget.mjs fails on such an icon and,
 * when a page that loads ui.js is over budget, prints this table so the cause has a name.
 */

const ICON_NAME = /name:\s*[`"']([a-z0-9-]+)[`"']\s*,\s*size:/g;

/** The lucide icon names (`undo-2`) in a built chunk. */
export function iconsInChunk(code) {
  return [...new Set([...code.matchAll(ICON_NAME)].map((m) => m[1]))].sort();
}

const IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]lucide-preact['"]/g;

/** icon name -> source files importing it, from `{ path: code }` and the barrel's export -> file map. */
export function iconImporters(sources, iconMap) {
  const users = new Map();
  for (const [file, code] of Object.entries(sources)) {
    for (const m of code.matchAll(IMPORT)) {
      for (const spec of m[1].split(',')) {
        const imported = spec.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0];
        const target = iconMap.get(imported);
        if (!target || !target.includes(`${path.sep}icons${path.sep}`) && !target.includes('/icons/')) continue;
        const name = path.basename(target, '.mjs');
        if (!users.has(name)) users.set(name, new Set());
        users.get(name).add(file);
      }
    }
  }
  return users;
}

const ANY_BARREL = /(?:from|import)\s*\(?\s*['"]lucide-preact['"]/g;
const TYPE_ONLY = /import\s+type\s*\{[^}]*\}\s*from\s*['"]lucide-preact['"]/g;

/**
 * A `lucide-preact` import the deep-import plugin cannot rewrite (`import * as`, a default import, a re-export,
 * `import()`) keeps the barrel, whose `icons` namespace pulls every icon into `ui`. Those icons have no importer,
 * so misplacedUiIcons cannot see them: refuse the import itself.
 */
export function unrewritableImports(sources) {
  const failures = [];
  for (const [file, code] of Object.entries(sources)) {
    const all = (code.match(ANY_BARREL) ?? []).length;
    const handled = (code.match(IMPORT) ?? []).length + (code.match(TYPE_ONLY) ?? []).length;
    if (all > handled) failures.push(`${file}: imports lucide-preact in a form scripts/lucideDeepImports.mjs cannot rewrite; use \`import { Icon } from 'lucide-preact'\` (DEBT-76)`);
  }
  return failures;
}

const toolOf = (file) => /(?:^|[\\/])src[\\/]tools[\\/]([\w-]+)[\\/]/.exec(file)?.[1] ?? null;

/** One line per icon in `ui`, naming who imports it. */
export function describeUiIcons(icons, users) {
  return icons.map((name) => `  ${name}: ${[...(users.get(name) ?? [])].sort().join(', ') || 'no lucide-preact importer (a createLucideIcon icon?)'}`);
}

/** Icons in `ui` that only one tool imports: each belongs in that tool's bundle. */
export function misplacedUiIcons(icons, users) {
  const failures = [];
  for (const name of icons) {
    const files = [...(users.get(name) ?? [])];
    const tools = new Set(files.map(toolOf));
    if (files.length > 0 && tools.size === 1 && !tools.has(null)) {
      failures.push(`/shared/ui.js: carries the ${name} icon, which only ${[...tools][0]} imports (${files.sort().join(', ')}); it belongs in that tool's bundle (DEBT-76, scripts/lucideDeepImports.mjs)`);
    }
  }
  return failures;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.[jt]sx?$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Reads dist/shared/ui.js and src/, for check-precache-budget.mjs. */
export function readUiIcons(root) {
  const ui = path.join(root, 'dist', 'shared', 'ui.js');
  const sources = Object.fromEntries(walk(path.join(root, 'src')).map((f) => [path.relative(root, f), fs.readFileSync(f, 'utf8')]));
  const problems = unrewritableImports(sources);
  if (!fs.existsSync(ui)) problems.push('dist/shared/ui.js: missing, so its icons cannot be checked (renamed chunk? update scripts/uiIcons.mjs)');
  const icons = fs.existsSync(ui) ? iconsInChunk(fs.readFileSync(ui, 'utf8')) : [];
  return { icons, users: iconImporters(sources, readIconMap(root)), problems };
}
