import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.join(__dirname, '..', 'src');

/*
 * Fails the build when a component renders a class string that resolves to no CSS.
 *
 * This is the source-side complement to check-dead-utilities.js, and it exists
 * because that guard has a structural blind spot: it reads class attributes out of
 * the built HTML, so it only ever sees an island's *initial* server-rendered state.
 * Every class that appears after an interaction - a loaded file, an open dialog, an
 * error - is invisible to it. Two real defects lived in that blind spot for months:
 *
 *   - UndoHistoryModal.jsx rendered `className="undo-history-item"` while its rules
 *     sat in an UndoHistoryModal.module.css nothing imported, so the Undo dialog
 *     shipped unstyled on Sign and Redact. The one class of its six that did reach
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
 * Scope: `.tsx` under src/ (excluding tests). The `.astro` surface is Tailwind's and
 * is already covered by check-dead-utilities.js against the built HTML.
 */

// A class here is one we accept has no CSS: a hook something else selects by name.
// Every entry must name its consumer, and "it looked unused" is not a reason - if the
// class has a rule in some .module.css, the bug is a missing import, not a hook.
const allowedClasses = new Map([
  ['tool-workspace', 'layout hook; queried by PdfSplitTool.test.tsx'],
  ['redact-draw-area', 'gesture-surface hook; queried by PdfRedactTool.test.tsx and e2e/redact/redact-editor.spec.js. Its appearance comes from the page-wrapper module class beside it'],
  ['redact-drawing-preview', 'selector hook; queried by e2e/redact/redact-editor.spec.js. Its visuals are inline geometry'],
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const allFiles = walk(srcDir);
const isTest = (f) => /\.(test|spec)\.[jt]sx?$/.test(f);

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
  // the same symptom CLAUDE.md's worktree-node_modules note describes, arrived at
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

if (problems.length > 0) {
  console.error(
    `Class-resolution check failed: ${problems.length} class string(s) render with no matching CSS.\n`,
  );
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log('Class-resolution check passed: every literal class string in src/**/*.tsx resolves to CSS.');
