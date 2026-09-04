import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '..', 'dist');

// Catches the silent failure mode that global.css's @theme block creates by
// design: Tailwind v4 compiles a utility to `font-weight: var(--font-weight-bold)`
// and then DROPS the whole rule when that theme variable is undefined. Since we
// deliberately skip Tailwind's default theme for the CSS budget, any utility
// whose token we never declared emits nothing at all - no error, no warning, no
// console message. `font-bold` was dead across 73 usages, and `rounded-2xl` left
// every tool page's hero icon square, before anything noticed.
//
// Reads the BUILT html rather than the .astro sources on purpose: the output has
// already resolved class:list arrays, frontmatter variables and `class={`...`}`
// template literals, so there is nothing left to parse badly. (The template
// literal is exactly how rounded-2xl hid from a source-level scan.)
//
// A class listed below is one we accept has no CSS. Add to it only for a class
// that is a behavioural hook - something JS queries or another selector matches -
// never to silence a utility that should have compiled. The fix for a utility is
// to declare its token in global.css's @theme block.
//
// This list has been abused once already: `undo-history-list` sat here labelled
// "scroll container the undo modal measures" while the real cause was that
// UndoHistoryModal.jsx never imported its CSS Module, so the entire dialog
// shipped unstyled behind a green check. If a class you are about to allowlist
// has a matching rule in some `.module.css`, the bug is a missing import, not a
// hook - go wire it. scripts/check-class-resolution.js now catches that case at
// the source, before it can reach this list.
const allowedClassPrefixes = ['lucide-'];
const allowedClasses = new Set([
  'lucide', // lucide-astro stamps this on every icon; styling comes from utilities
  'active', // toggled by the offline-guide tab script, matched via [&.active]: variants
  'faq-card', // <details> hook for the FAQ disclosure click interceptor
  'faq-item',
  'offline-tab-btn', // querySelectorAll targets in index.astro's tab script
  'offline-tab-panel',
  'doc-line', // autosave card sketch; sized by sibling combinators
  'short',
  'medium',
]);

if (!fs.existsSync(distDir)) {
  console.error(`dist directory not found: ${distDir}. Run npm run build first.`);
  process.exit(1);
}

function getHtmlFiles(dir, fileList = []) {
  for (const entry of fs.readdirSync(dir)) {
    const filePath = path.join(dir, entry);
    if (fs.statSync(filePath).isDirectory()) getHtmlFiles(filePath, fileList);
    else if (filePath.endsWith('.html')) fileList.push(filePath);
  }
  return fileList;
}

// Attribute values arrive HTML-escaped, so the arbitrary variants that carry an
// ampersand (`[&_svg]:block`) need decoding before they can match a selector.
const decodeEntities = (value) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const htmlFiles = getHtmlFiles(distDir);
if (htmlFiles.length === 0) {
  console.error('No HTML files found in the build output.');
  process.exit(1);
}

// Per page, not site-wide. This used to concatenate every page's inline CSS
// into one string and ask whether a class had a rule ANYWHERE in the build,
// which was equivalent while one shared stylesheet was inlined into all 22
// pages. It stopped being equivalent under ARCH-13: each page family now
// compiles its own utility set from an explicit @source list, so a class whose
// rule was only generated into another family's entry sheet renders unstyled on
// the page that uses it while still being present somewhere in the build. That
// is exactly the silent visual bug the split could introduce, and the reason
// the split is safe to make: forgetting a @source now fails the build here,
// naming the page and the class, instead of shipping.
const usage = new Map();
const pageHasRule = new Map(); // dist-relative page -> (className) => boolean

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const pageLabel = path.relative(distDir, file);

  let css = '';
  for (const [, block] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += block;
  // Tailwind escapes the non-identifier characters in a generated selector
  // (`.text-\[0\.9rem\]`). Dropping every backslash lets the raw class name match.
  const flatCss = css.replace(/\\/g, '');
  pageHasRule.set(pageLabel, (className) => {
    const needle = `.${className}`;
    for (let i = flatCss.indexOf(needle); i !== -1; i = flatCss.indexOf(needle, i + 1)) {
      const next = flatCss[i + needle.length];
      if (next === undefined || !/[\w-]/.test(next)) return true;
    }
    return false;
  });

  for (const [, attr] of html.matchAll(/\sclass="([^"]*)"/g)) {
    for (const className of decodeEntities(attr).split(/\s+/)) {
      if (!className) continue;
      if (!usage.has(className)) usage.set(className, new Set());
      usage.get(className).add(pageLabel);
    }
  }
}

const dead = [];
for (const [className, pages] of usage) {
  if (allowedClasses.has(className)) continue;
  if (allowedClassPrefixes.some((prefix) => className.startsWith(prefix))) continue;
  const missingOn = [...pages].filter((page) => !pageHasRule.get(page)(className)).sort();
  if (missingOn.length > 0) dead.push([className, missingOn]);
}

if (dead.length > 0) {
  console.error(`Dead utility check failed: ${dead.length} class(es) ship in the HTML but compile to no CSS on the page that uses them.`);
  console.error("Either the page family's entry sheet in src/styles/ is missing an @source for the file that writes the class,");
  console.error("or the token is missing from global.css's @theme block (Tailwind drops the rule without it),");
  console.error('or, if the class is a behavioural hook, add it to allowedClasses in this script.');
  for (const [className, pages] of dead.sort()) {
    const shown = pages.slice(0, 3).join(', ');
    console.error(`  ${className} - ${pages.length} page(s): ${shown}${pages.length > 3 ? ', ...' : ''}`);
  }
  process.exit(1);
}

console.log(`Dead utility check passed. ${usage.size} distinct classes in the build, each resolving to CSS on every page that uses it.`);
