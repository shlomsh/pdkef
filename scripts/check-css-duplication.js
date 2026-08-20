import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '..', 'dist');

/*
 * Measures how much of the CSS we inline into every page that page actually needs.
 *
 * The failure mode this catches: Astro inlines one shared stylesheet into all 12
 * built pages, so a rule added for a single page is paid for 12 times. Nothing in
 * the existing guards notices. check-css-bundle.js reduces the whole subject to one
 * scalar - the largest per-page inline <style> - and a scalar cannot tell
 * "this page legitimately needs a lot of CSS" (/sign/ is a document editor) from
 * "this page is carrying 11 other pages' CSS", which is the actual defect. It has
 * already blamed the wrong page once: E3.4 tripped the 80,000 cap at 80,473 bytes
 * on /sign/, and the fix belonged in index.astro. check-dead-utilities.js asks a
 * different question again - whether a class in the HTML has any rule *somewhere* -
 * and a utility shipped to 12 pages and used by one passes it with a green check.
 *
 * So this script reports three numbers instead:
 *
 *   1. Duplication factor - rule bytes shipped across all pages / distinct rule
 *      bytes. 1.0 would mean every page carries only its own CSS.
 *   2. Per-page dead bytes - rules whose selectors mention no class present in that
 *      page's own HTML. Exact for the utility layer, see the caveat below.
 *   3. Single-page utility count - utility classes used by exactly one built page.
 *      Each one is a rule the other 11 pages carry for nothing, and it is the number
 *      that moves when someone reaches for a one-off utility on a single page.
 *
 * These are ratchets, not budgets. The thresholds sit just above the values measured
 * on main; the point is that the numbers cannot silently get worse, and that when
 * they do the output names the page and the classes responsible instead of pointing
 * at whichever page happens to be biggest.
 *
 * WHY CSS-MODULES-HASHED CLASSES ARE EXCLUDED FROM THE DEAD-BYTES MEASUREMENT
 * ---------------------------------------------------------------------------
 * "Unused at SSR" and "dead" are the same thing for the utility layer only, and for
 * one specific reason: E3.2 excluded .jsx from Tailwind's content scan, so every
 * consumer of a utility is in build-time-rendered .astro markup and therefore in the
 * built HTML. Nothing can start using a utility after hydration.
 *
 * That reasoning does not transfer to the editor's CSS Modules (`_name_hash_line`,
 * e.g. `_dropzone_1x8mv_7`). Those classes are rendered by Preact islands - a loaded
 * file, an open dialog, a selected element - so their absence from the server-
 * rendered HTML is the normal case, not a defect. Counting them would report the
 * whole Sign and Redact editor as dead on every page including its own, which is
 * both wrong and loud enough to make the real signal unreadable. A rule is skipped
 * if ANY class in its selector is module-hashed, so mixed selectors are skipped too.
 *
 * PARSING NOTE - the trap that makes every number wrong if you get it wrong
 * ------------------------------------------------------------------------
 * Tailwind wraps its entire output in `@layer utilities{...}`, and its custom
 * property registrations in `@layer properties{@supports(...){...}}`. A naive
 * top-level brace split therefore sees the whole utility layer as ONE rule with a
 * selector of `@layer utilities` and no classes in it: the duplication factor
 * collapses, dead bytes read as zero, and the script passes on anything. The parser
 * below descends through @layer / @media / @supports / @container to reach leaf
 * rules, and treats @property / @font-face / @keyframes as leaves (their bodies are
 * declarations or frame selectors, not rules).
 */

// Ratchets, set just above the values measured on main (2026-08-14, after E3.5/E3.6
// promoted --shadow-xs/sm/md/lg and --ease-out/emphasized/spring into @theme and
// consolidated the transition-[...] long tail to four canonical property lists):
// duplication 6.78x, worst page 28,019 dead bytes (/licenses/, still ~94% of its
// class-bearing CSS - that page's ratio is dominated by content, not the
// shadow/ease/transition cleanup), 144 single-page utilities. Lower these further
// when work lands that improves a number; never raise one without saying which
// page got worse and why that is acceptable.
//
// Duplication factor was raised again (6.95x -> 9.85x) when the Launch/SEO
// backlog item landed 8 new static content pages (3 long-tail landing pages, 1
// Redact landing page, 4 OS how-to guides - see TODO.md). This is the one ratchet
// here that scales with page *count*, not CSS quality: `inlineStylesheets:
// 'always'` bakes the whole shared utility stylesheet into every page, so the
// numerator (bytes shipped, summed across all pages) grows with each new page
// almost regardless of how disciplined that page's markup is, while the
// denominator (distinct rule bytes site-wide) barely moves if the new pages reuse
// the existing utility vocabulary. That's exactly what happened: adding 8 pages
// (12 -> 20) moved distinct bytes by +455 (102,913 -> 103,368) while shipped bytes
// rose with page count (697,512 -> 1,014,340), pushing the factor from 6.78x to
// 9.81x. The other two ratchets below are unaffected by page count and both
// stayed inside their limits without being touched, which is the signal that this
// was page growth, not new duplication.
//
// THE OBVIOUS FIX WAS MEASURED AND REJECTED (2026-08-20). Since this factor is
// largely a consequence of `build.inlineStylesheets: 'always'`, the tempting move
// is to flip that to 'auto' and watch the number collapse. It does collapse, to
// 1.72x, but only because this script reads inline <style> and nothing else: with
// the CSS in <link> tags it measures ~34KB of leftovers instead of the ~1.05MB
// actually shipped, per-page dead bytes read 0, and single-page utilities read 0.
// All three ratchets would flatline and never fire again. The number would look
// like a win and would in fact be a blind guard.
//
// The config itself also lost on its own merits, so there is no quiet win waiting
// here: an external stylesheet is render-blocking and discovered only after the
// document parses, and Astro emits no preload for it, so 'auto' costs one extra
// serialized round trip and is worse on first-view bytes too (/sign/: 43,097 vs
// 41,723 brotli). Full numbers and the multi-page and precache analysis are in the
// comment on `inlineStylesheets` in astro.config.mjs. Read that before touching
// this constant for that reason.
//
// So this ratchet stays what it is: a page-count-sensitive number that is useful
// for catching a jump between builds at a FIXED page count, and that must be
// re-based (saying so, as above) whenever pages are added. It is not a measure of
// style quality on its own; MAX_PAGE_DEAD_BYTES and MAX_SINGLE_PAGE_UTILITIES
// below are the two here that are page-count-invariant and do measure that.
const MAX_DUPLICATION_FACTOR = 9.85;
const MAX_PAGE_DEAD_BYTES = 29_000;
const MAX_SINGLE_PAGE_UTILITIES = 148;

if (!fs.existsSync(distDir)) {
  console.error(`dist directory not found: ${distDir}. Run npm run build first.`);
  process.exit(1);
}

function getHtmlFiles(dir, fileList = []) {
  for (const entry of fs.readdirSync(dir)) {
    const filePath = path.join(dir, entry);
    if (fs.statSync(filePath).isDirectory()) getHtmlFiles(filePath, fileList);
    // dist/google*.html is the Search Console verification file: a bare string with
    // no <head>, no CSS, and no classes. Counting it would report a page that ships
    // nothing as a page with no duplication.
    else if (filePath.endsWith('.html') && !path.basename(filePath).startsWith('google')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

// --- CSS parsing -------------------------------------------------------------

// At-rules whose bodies contain further rules rather than declarations. Everything
// else with a block (@property, @font-face, @keyframes, @page) is a leaf.
const GROUPING_AT_RULES = new Set(['@layer', '@media', '@supports', '@container', '@scope', '@starting-style']);

/**
 * Walks a stylesheet and yields every leaf rule with the at-rule context it sits in.
 * Strings, comments and parens are tracked so a brace inside any of them cannot end
 * a block early.
 */
function forEachLeafRule(css, visit, context = []) {
  let i = 0;
  const len = css.length;
  let preludeStart = 0;

  while (i < len) {
    const ch = css[i];

    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? len : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i += 1;
      while (i < len && css[i] !== ch) i += css[i] === '\\' ? 2 : 1;
      i += 1;
      continue;
    }
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '(') {
      let depth = 1;
      i += 1;
      while (i < len && depth > 0) {
        if (css[i] === '\\') i += 1;
        else if (css[i] === '(') depth += 1;
        else if (css[i] === ')') depth -= 1;
        i += 1;
      }
      continue;
    }
    if (ch === ';') {
      // A statement at-rule, e.g. `@layer theme,base,components;` or `@charset`.
      const statement = css.slice(preludeStart, i + 1).trim();
      if (statement) visit({ context, prelude: statement, body: null, text: statement });
      i += 1;
      preludeStart = i;
      continue;
    }
    if (ch === '{') {
      const prelude = css.slice(preludeStart, i).trim();
      const bodyStart = i + 1;
      let depth = 1;
      i += 1;
      while (i < len && depth > 0) {
        const c = css[i];
        if (c === '\\') i += 1;
        else if (c === '/' && css[i + 1] === '*') {
          const end = css.indexOf('*/', i + 2);
          i = end === -1 ? len - 1 : end + 1;
        } else if (c === '"' || c === "'") {
          i += 1;
          while (i < len && css[i] !== c) i += css[i] === '\\' ? 2 : 1;
        } else if (c === '{') depth += 1;
        else if (c === '}') depth -= 1;
        i += 1;
      }
      const body = css.slice(bodyStart, i - 1);
      const atName = prelude.startsWith('@') ? prelude.split(/[\s(]/, 1)[0].toLowerCase() : null;

      if (atName && GROUPING_AT_RULES.has(atName)) {
        forEachLeafRule(body, visit, [...context, prelude]);
      } else {
        visit({ context, prelude, body, text: `${prelude}{${body}}` });
      }
      preludeStart = i;
      continue;
    }
    i += 1;
  }
}

/**
 * Class names mentioned in a selector, with Tailwind's escaping undone so they match
 * the raw strings in a class attribute (`.md\:flex` -> `md:flex`, `.\!visible` ->
 * `!visible`). Reads only the prelude, never a declaration body, so a decimal in a
 * value cannot be mistaken for a class.
 */
function classesInSelector(selector) {
  const found = [];
  for (let i = 0; i < selector.length; i += 1) {
    if (selector[i] === '\\') {
      i += 1;
      continue;
    }
    if (selector[i] !== '.') continue;
    let j = i + 1;
    let name = '';
    while (j < selector.length) {
      const c = selector[j];
      if (c === '\\') {
        name += selector[j + 1] ?? '';
        j += 2;
        continue;
      }
      if (!/[\w-]/.test(c)) break;
      name += c;
      j += 1;
    }
    if (name) found.push(name);
    i = j - 1;
  }
  return found;
}

// Vite/Astro's CSS Modules naming: `_localName_hash_line`.
const isModuleHashed = (className) => /^_.+_[a-z0-9]+_\d+$/.test(className);

const decodeEntities = (value) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

// --- Measurement -------------------------------------------------------------

const htmlFiles = getHtmlFiles(distDir).sort();
if (htmlFiles.length === 0) {
  console.error('No HTML files found in the build output.');
  process.exit(1);
}

const distinctRules = new Map(); // context+rule text -> bytes
const utilityClassPages = new Map(); // utility class -> Set(page)
const pages = [];
let totalShippedRuleBytes = 0;
let totalRawStyleBytes = 0;

for (const file of htmlFiles) {
  const label = `/${path.relative(distDir, file).replace(/(^|\/)index\.html$/, '/').replace(/^\/+/, '')}`;
  const html = fs.readFileSync(file, 'utf8');

  const pageClasses = new Set();
  for (const [, attr] of html.matchAll(/\sclass="([^"]*)"/g)) {
    for (const className of decodeEntities(attr).split(/\s+/)) {
      if (className) pageClasses.add(className);
    }
  }

  let css = '';
  for (const [, block] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += block;
  totalRawStyleBytes += Buffer.byteLength(css, 'utf8');

  const page = {
    label,
    shippedBytes: 0,
    deadBytes: { utilities: 0, global: 0 },
    liveBytes: { utilities: 0, global: 0 },
    deadSamples: { utilities: [], global: [] },
    classes: pageClasses,
  };

  forEachLeafRule(css, ({ context, prelude, body, text }) => {
    const bytes = Buffer.byteLength(text, 'utf8');
    page.shippedBytes += bytes;
    totalShippedRuleBytes += bytes;

    const key = `${context.join('>')}|${text}`;
    if (!distinctRules.has(key)) distinctRules.set(key, bytes);

    if (body === null) return; // statement at-rule, no selector
    const inUtilities = context.some((c) => /^@layer\s+utilities\b/.test(c));
    const classes = classesInSelector(prelude);
    if (classes.length === 0) return; // element selectors, :root, @property, @font-face
    // See the header: an island can add a module class after hydration, so absence
    // from the SSR'd HTML says nothing about whether the rule is needed.
    if (classes.some(isModuleHashed)) return;

    const group = inUtilities ? 'utilities' : 'global';
    if (inUtilities) {
      for (const className of classes) {
        if (!utilityClassPages.has(className)) utilityClassPages.set(className, new Set());
      }
    }

    // Conservative: one class present anywhere in the selector keeps the rule alive,
    // even for a descendant selector that needs both halves. Understating dead bytes
    // is the safe direction for a ratchet.
    const used = classes.some((className) => pageClasses.has(className));
    if (used) {
      page.liveBytes[group] += bytes;
    } else {
      page.deadBytes[group] += bytes;
      if (page.deadSamples[group].length < 5) page.deadSamples[group].push(prelude);
    }
  });

  pages.push(page);
}

// Only now is the full set of utility classes known - a class can first be seen in
// the CSS of a page parsed after the page that uses it - so attribute the usage in
// one pass over the pages already read, rather than as each page is parsed.
for (const page of pages) {
  for (const className of page.classes) {
    if (utilityClassPages.has(className)) utilityClassPages.get(className).add(page.label);
  }
}

let distinctRuleBytes = 0;
for (const bytes of distinctRules.values()) distinctRuleBytes += bytes;

const duplicationFactor = totalShippedRuleBytes / distinctRuleBytes;

const singlePageUtilities = [...utilityClassPages.entries()]
  .filter(([, pageSet]) => pageSet.size === 1)
  .map(([className, pageSet]) => [className, [...pageSet][0]])
  .sort();

const worstPage = pages.reduce((worst, page) => {
  const total = page.deadBytes.utilities + page.deadBytes.global;
  const worstTotal = worst ? worst.deadBytes.utilities + worst.deadBytes.global : -1;
  return total > worstTotal ? page : worst;
}, null);
const worstPageDeadBytes = worstPage.deadBytes.utilities + worstPage.deadBytes.global;

const siteWide = pages.reduce(
  (totals, page) => ({
    dead: totals.dead + page.deadBytes.utilities + page.deadBytes.global,
    utilitiesDead: totals.utilitiesDead + page.deadBytes.utilities,
    utilitiesShipped:
      totals.utilitiesShipped + page.deadBytes.utilities + page.liveBytes.utilities,
  }),
  { dead: 0, utilitiesDead: 0, utilitiesShipped: 0 },
);

// --- Report ------------------------------------------------------------------

const kb = (bytes) => `${bytes.toLocaleString('en-US')} bytes`;
const pct = (part, whole) => (whole === 0 ? '0%' : `${Math.round((part / whole) * 100)}%`);

console.log(`CSS duplication report (${pages.length} pages, ${kb(totalRawStyleBytes)} of inline <style> shipped):`);
console.log(
  `  Duplication factor:     ${duplicationFactor.toFixed(2)}x  (${kb(totalShippedRuleBytes)} shipped / ${kb(distinctRuleBytes)} distinct, limit ${MAX_DUPLICATION_FACTOR.toFixed(2)}x)`,
);
console.log(`  Worst page dead bytes:  ${kb(worstPageDeadBytes)} on ${worstPage.label} (limit ${kb(MAX_PAGE_DEAD_BYTES)})`);
console.log(`  Single-page utilities:  ${singlePageUtilities.length} (limit ${MAX_SINGLE_PAGE_UTILITIES})`);
console.log(
  `  Site-wide dead:         ${kb(siteWide.dead)}, of which ${kb(siteWide.utilitiesDead)} is utility CSS ` +
    `(${pct(siteWide.utilitiesDead, siteWide.utilitiesShipped)} of all utility bytes shipped)`,
);
console.log('  Per page (dead = selector mentions no class in that page\'s HTML; CSS Modules excluded):');
for (const page of [...pages].sort(
  (a, b) => b.deadBytes.utilities + b.deadBytes.global - (a.deadBytes.utilities + a.deadBytes.global),
)) {
  const dead = page.deadBytes.utilities + page.deadBytes.global;
  const classed = dead + page.liveBytes.utilities + page.liveBytes.global;
  console.log(
    `    ${page.label.padEnd(16)} ${String(dead).padStart(7)} dead of ${String(classed).padStart(7)} class-bearing bytes (${pct(dead, classed).padStart(4)}) - utilities ${page.deadBytes.utilities}, global ${page.deadBytes.global}`,
  );
}

const failures = [];
if (duplicationFactor > MAX_DUPLICATION_FACTOR) {
  failures.push(
    `Duplication factor ${duplicationFactor.toFixed(2)}x exceeds ${MAX_DUPLICATION_FACTOR.toFixed(2)}x. ` +
      'A rule added to the shared stylesheet is paid for on all pages; scope it to the page that needs it.',
  );
}
if (worstPageDeadBytes > MAX_PAGE_DEAD_BYTES) {
  failures.push(
    `${worstPage.label} ships ${kb(worstPageDeadBytes)} of CSS whose selectors match nothing in its own HTML, ` +
      `over the ${kb(MAX_PAGE_DEAD_BYTES)} limit. Sample selectors: ` +
      [...worstPage.deadSamples.utilities, ...worstPage.deadSamples.global].slice(0, 5).join(', '),
  );
}
if (singlePageUtilities.length > MAX_SINGLE_PAGE_UTILITIES) {
  const shown = singlePageUtilities.slice(0, 10).map(([className, page]) => `${className} (${page})`);
  failures.push(
    `${singlePageUtilities.length} utility classes are used by exactly one page, over the ${MAX_SINGLE_PAGE_UTILITIES} limit. ` +
      `Every one of them ships to all ${pages.length} pages. First few: ${shown.join(', ')}`,
  );
}

if (failures.length > 0) {
  console.error('\nCSS duplication check failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('CSS duplication check passed.');
