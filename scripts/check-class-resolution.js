import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');
const srcDir = path.join(repoRoot, 'src');
const allowlistPath = path.join(__dirname, 'css-module-class-allowlist.json');

/*
 * Fails the build when a component renders a class string that resolves to no CSS.
 *
 * This is the source-side complement to check-dead-utilities.js, and it exists
 * because that guard has a structural blind spot: it reads class attributes out of
 * the built HTML, so it only ever sees an island's *initial* server-rendered state.
 * Every class that appears after an interaction - a loaded file, an open dialog, an
 * error - is invisible to it. Two real defects lived in that blind spot for months:
 *
 *   - UndoHistoryModal.jsx (the change-history dialog, since removed from both
 *     tools) rendered `className="undo-history-item"` while its rules sat in an
 *     UndoHistoryModal.module.css nothing imported, so the dialog shipped
 *     unstyled on Sign and Redact. The one class of its six that did reach
 *     the built HTML was then *allowlisted* in the other guard, which is how a real
 *     defect got a green check and a reassuring comment.
 *   - `.hint-message` was deleted from global.css in a40a937 and never re-homed, so
 *     five tools rendered their "skipped a file that wasn't a PDF" notice against no
 *     rule at all.
 *
 * Both share one shape - a class string in JSX with nothing behind it - so that is
 * what this checks, reading the source rather than the output. It needs no build,
 * which is why it runs first in `npm run test:css`.
 *
 * ARCH-87 adds the reverse direction over every .module.css under src/: the module must have
 * an importer, and every class it defines must be referenced from an importer
 * (`styles.x`, `styles['x']`, destructuring), by a `composes:`, or listed in
 * scripts/css-module-class-allowlist.json (for keys built dynamically; the reason names the
 * code that builds them). A module nobody imports, or a class nobody reads, is dead CSS.
 *
 * Scope: `.tsx` under src/ (excluding tests). The `.astro` surface is Tailwind's and
 * is already covered by check-dead-utilities.js against the built HTML.
 */

// A class here is one we accept has no CSS: a hook something else selects by name.
// Every entry must name its consumer, and "it looked unused" is not a reason - if the
// class has a rule in some .module.css, the bug is a missing import, not a hook.
const allowedClasses = new Map([
  ['redact-draw-area', 'gesture-surface hook; queried by PdfRedactTool.test.tsx and src/tools/redact/e2e/redact-editor.spec.js. Its appearance comes from the page-wrapper module class beside it'],
  ['redact-drawing-preview', 'selector hook; queried by src/tools/redact/e2e/redact-editor.spec.js. Its visuals are inline geometry'],
]);


// --- Reverse direction (ARCH-87): pure parts, unit-tested in check-class-resolution.test.mjs ---

// The classes a CSS Module *defines*: read from selector preludes only (text before a `{`),
// with comments, strings, url(...) and `:global(...)` removed, so `url(a.png)`, a decimal,
// or a global selector never counts as a local class.
export function definedClasses(css) {
  const stripped = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
    .replace(/url\([^)]*\)/g, '')
    .replace(/:global\((?:[^()]|\([^()]*\))*\)/g, '');
  const out = new Set();
  for (const m of stripped.matchAll(/([^{};]+)\{/g)) {
    const prelude = m[1].trim();
    if (prelude.startsWith('@')) continue;
    for (const c of prelude.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) out.add(c[1]);
  }
  return out;
}

// `composes: a b;` (same module) and `composes: a from './x.module.css';` -> [{ names, from }]
export function composesIn(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...stripped.matchAll(/composes\s*:\s*([^;}]+)/g)].map((m) => {
    const fromMatch = m[1].match(/^(.*?)\s+from\s+['"]([^'"]+)['"]/s);
    const names = (fromMatch ? fromMatch[1] : m[1]).trim().split(/\s+/).filter(Boolean);
    return { names, from: fromMatch ? fromMatch[2] : null };
  });
}

// Every `.module.css` import in a source file: [{ binding|null, spec }]. A side-effect import
// has no binding. `import * as x` and default imports both bind a namespace.
export function moduleImportsIn(source) {
  const out = [];
  for (const m of source.matchAll(/import\s+(?:\*\s+as\s+)?(\w+)\s+from\s+['"]([^'"]+\.module\.css)['"]/g)) {
    out.push({ binding: m[1], spec: m[2] });
  }
  for (const m of source.matchAll(/import\s+['"]([^'"]+\.module\.css)['"]/g)) out.push({ binding: null, spec: m[1] });
  return out;
}

// Names a file re-exports an import binding under: `export { styles as workspaceStyles }` and
// `export const x = styles`. Other files read keys off those names, so they count as reads.
export function reexportedAliases(source, binding) {
  const b = binding.replace(/\$/g, '\\$');
  const out = new Set();
  for (const m of source.matchAll(new RegExp(`export\\s*\\{([^}]*)\\}`, 'g'))) {
    for (const part of m[1].split(',')) {
      const [from, , to] = part.trim().split(/\s+/);
      if (from === binding && to) out.add(to);
    }
  }
  for (const m of source.matchAll(new RegExp(`export\\s+const\\s+(\\w+)\\s*=\\s*${b}\\s*[;\\n]`, 'g'))) out.add(m[1]);
  return out;
}

// The keys a source file reads off one import binding.
export function keysUsed(source, binding) {
  const keys = new Set();
  const b = binding.replace(/\$/g, '\\$');
  for (const m of source.matchAll(new RegExp(`\\b${b}\\??\\.([A-Za-z_][\\w]*)`, 'g'))) keys.add(m[1]);
  for (const m of source.matchAll(new RegExp(`\\b${b}\\[\\s*['"]([^'"]+)['"]\\s*\\]`, 'g'))) keys.add(m[1]);
  // `styles[cond ? 'a' : 'b']`: every quoted literal inside the brackets is a key read.
  for (const m of source.matchAll(new RegExp(`\\b${b}\\[([^\\]]*['"][^\\]]*)\\]`, 'g'))) {
    for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) keys.add(q[1]);
  }
  for (const m of source.matchAll(new RegExp(`\\{([^{}]*)\\}\\s*=\\s*${b}\\b`, 'g'))) {
    for (const part of m[1].split(',')) {
      const key = part.trim().split(':')[0].trim().replace(/^['"]|['"]$/g, '');
      if (key && !key.startsWith('...')) keys.add(key);
    }
  }
  return keys;
}

// Non-empty literal prefixes of template-literal keys: styles[`field-hint-${kind}`] -> 'field-hint-'.
// An empty prefix (styles[`${x}`]) says nothing, so it still needs the dynamic-key allowlist.
export function keyPrefixesUsed(source, binding) {
  const out = new Set();
  const b = binding.replace(/\$/g, '\\$');
  for (const m of source.matchAll(new RegExp(`\\b${b}\\[\\s*\`([^\`$]*)\\$\\{`, 'g'))) if (m[1]) out.add(m[1]);
  return out;
}

// modules: Map<file, Set<defined class>>; importers: Map<file, Set<importer file>>;
// used: Map<file, Set<referenced key>> (imports + composes); allowlist: [{ file, class, reason }].
export function reverseProblems({ modules, importers, used, prefixes = new Map(), allowlist }) {
  const problems = [];
  const byPrefix = (file, name) => [...(prefixes.get(file) ?? [])].some((p) => name.startsWith(p));
  const allowed = new Set(allowlist.map((e) => `${e.file}::${e.class}`));
  for (const [file, classes] of modules) {
    if (!importers.get(file)?.size) {
      problems.push(`${file}  has no importer. Delete it, or import it where its classes are used.`);
      continue;
    }
    for (const name of classes) {
      if (used.get(file)?.has(name) || byPrefix(file, name) || allowed.has(`${file}::${name}`)) continue;
      problems.push(
        `${file}  defines .${name}, which no importer references.\n` +
          `    Delete the rule, or (for a key built dynamically) add it to scripts/css-module-class-allowlist.json naming the code that builds it.`,
      );
    }
  }
  for (const e of allowlist) {
    if (!modules.get(e.file)?.has(e.class)) {
      problems.push(`css-module-class-allowlist.json: ${e.file} no longer defines .${e.class}. Remove the entry.`);
    } else if (used.get(e.file)?.has(e.class) || byPrefix(e.file, e.class)) {
      problems.push(`css-module-class-allowlist.json: .${e.class} in ${e.file} is referenced directly now. Remove the entry.`);
    }
  }
  return problems;
}

export function collectReverseInputs(allFiles, readFile = (f) => fs.readFileSync(f, 'utf8')) {
  const modules = new Map();
  const cssSources = new Map();
  for (const f of allFiles) {
    if (!f.endsWith('.module.css')) continue;
    const css = readFile(f);
    cssSources.set(f, css);
    modules.set(f, definedClasses(css));
  }
  const importers = new Map([...modules.keys()].map((f) => [f, new Set()]));
  const used = new Map([...modules.keys()].map((f) => [f, new Set()]));
  const prefixes = new Map([...modules.keys()].map((f) => [f, new Set()]));
  const aliases = new Map();
  const sourceExt = /\.(?:[cm]?[jt]sx?|astro)$/;
  // Tests and specs neither import a module nor read a class for the purposes of this check.
  const isReader = (f) => sourceExt.test(f) && !/\.(?:test|spec)\.[^/]*$/.test(f);
  for (const f of allFiles) {
    if (!isReader(f)) continue;
    const source = readFile(f);
    for (const { binding, spec } of moduleImportsIn(source)) {
      const target = path.resolve(path.dirname(f), spec);
      if (!modules.has(target)) continue;
      importers.get(target).add(f);
      if (binding) {
        for (const k of keysUsed(source, binding)) used.get(target).add(k);
        for (const k of keyPrefixesUsed(source, binding)) prefixes.get(target).add(k);
        for (const alias of reexportedAliases(source, binding)) aliases.set(alias, target);
      }
    }
  }
  for (const f of allFiles) {
    if (!isReader(f)) continue;
    const source = readFile(f);
    for (const [alias, target] of aliases) {
      if (source.includes(alias)) {
        for (const k of keysUsed(source, alias)) used.get(target).add(k);
        for (const k of keyPrefixesUsed(source, alias)) prefixes.get(target).add(k);
      }
    }
  }
  for (const [file, css] of cssSources) {
    for (const { names, from } of composesIn(css)) {
      const target = from ? path.resolve(path.dirname(file), from) : file;
      // A module composed from another one is imported by it (ARCH-89's shared hit target).
      if (from && importers.has(target)) importers.get(target).add(file);
      if (used.has(target)) for (const n of names) used.get(target).add(n);
    }
  }
  return { modules, importers, used, prefixes };
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const isTest = (f) => /\.(test|spec)\.[jt]sx?$/.test(f);

function main() {
const allFiles = walk(srcDir);
// --- 1. Where every class rule lives -----------------------------------------
const globalClasses = new Set();
const moduleClasses = new Map(); // class -> [module file, ...]

const classSelectorsIn = (css) => {
  // Strip comments so a commented-out rule cannot vouch for a live class.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...stripped.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
};

for (const file of allFiles) {
  if (!file.endsWith('.css')) continue;
  const css = fs.readFileSync(file, 'utf8');
  const target = file.endsWith('.module.css') ? null : globalClasses;
  for (const name of classSelectorsIn(css)) {
    if (target) target.add(name);
    else {
      if (!moduleClasses.has(name)) moduleClasses.set(name, []);
      if (!moduleClasses.get(name).includes(file)) moduleClasses.get(name).push(file);
    }
  }
}

// --- 2. Literal class strings in components ----------------------------------
// Plain string attributes (class="a b") plus the literal chunks of a template
// literal (class={`a ${styles.b}`}), which is exactly how one of these hid from an
// earlier source-level scan.
function literalClassUses(source) {
  const uses = [];
  const push = (raw, index) => {
    for (const name of raw.split(/\s+/)) {
      if (name && !name.includes('$') && !name.includes('{')) uses.push({ name, index });
    }
  };
  for (const m of source.matchAll(/\bclass(?:Name)?="([^"]*)"/g)) push(m[1], m.index);
  for (const m of source.matchAll(/\bclass(?:Name)?=\{`([^`]*)`\}/g)) {
    push(m[1].replace(/\$\{[^}]*\}/g, ' '), m.index);
  }
  return uses;
}

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

const problems = [];

for (const file of allFiles) {
  if (!file.endsWith('.tsx') || isTest(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(path.join(__dirname, '..'), file);

  // binding -> resolved module path, so a `styles['x']` lookup can be checked
  // against the specific file that binding points at.
  const moduleImports = new Map(
    [...source.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.css)['"]/g)].map((m) => [
      m[1],
      path.resolve(path.dirname(file), m[2]),
    ]),
  );
  const importedModules = new Set(moduleImports.values());

  // The other half of the same failure: the lookup is right but the key is not.
  // A CSS Module returns undefined for a missing key and Preact renders that as
  // `class="undefined"` - no error, no warning, just an unstyled element. This is
  // the same symptom docs/troubleshooting.md's worktree-node_modules note describes, arrived at
  // by a typo or by renaming a rule without its call sites.
  for (const m of source.matchAll(/\b(\w+)(?:\['([^']+)'\]|\.([A-Za-z_]\w*))/g)) {
    const owner = moduleImports.get(m[1]);
    if (!owner) continue;
    const key = m[2] ?? m[3];
    const exported = moduleClasses.get(key)?.includes(owner);
    if (!exported) {
      problems.push(
        `${rel}:${lineOf(source, m.index)}  ${m[1]}['${key}'] is not defined in ` +
          `${path.basename(owner)}, so it renders as class="undefined".`,
      );
    }
  }

  for (const { name, index } of literalClassUses(source)) {
    if (globalClasses.has(name) || allowedClasses.has(name)) continue;

    const owners = moduleClasses.get(name);
    const line = lineOf(source, index);

    if (!owners) {
      problems.push(
        `${rel}:${line}  "${name}" has no rule in global.css or any .module.css.\n` +
          `    Style it, or add it to allowedClasses in this script naming the consumer that selects it.`,
      );
    } else if (owners.some((owner) => importedModules.has(owner))) {
      problems.push(
        `${rel}:${line}  "${name}" is rendered as a raw string, but its rule is in ` +
          `${path.basename(owners[0])}, where CSS Modules hashes it.\n` +
          `    Use styles['${name}'] from the module this file already imports.`,
      );
    } else {
      problems.push(
        `${rel}:${line}  "${name}" is rendered as a raw string, but its rule lives in ` +
          `${owners.map((o) => path.basename(o)).join(', ')}, which this file does not import.\n` +
          `    Import that module and use styles['${name}'] - a CSS Module's classes are hashed, ` +
          `so the raw name never matches.`,
      );
    }
  }
}

const reverse = collectReverseInputs(allFiles);
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
const rel = (f) => path.relative(repoRoot, f).split(path.sep).join('/');
const relMap = (m) => new Map([...m].map(([k, v]) => [rel(k), v]));
const reverseList = reverseProblems({
  modules: relMap(reverse.modules),
  importers: relMap(reverse.importers),
  used: relMap(reverse.used),
  prefixes: relMap(reverse.prefixes),
  allowlist,
});
problems.push(...reverseList);

if (problems.length > 0) {
  console.error(
    `Class-resolution check failed: ${problems.length} class string(s) render with no matching CSS or leave CSS Module rules unused.\n`,
  );
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log('Class-resolution check passed: every literal class string in src/**/*.tsx resolves to CSS, and every CSS Module has an importer and no unreferenced class.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) main();
