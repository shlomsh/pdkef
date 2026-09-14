import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

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
 *   1. Family duplication - pages are grouped into families by the hash of their
 *      largest <style> block (their inlined page-family entry sheet), and this is
 *      the HEAVIEST family's mean shipped bytes per page / distinct rule bytes
 *      (see MAX_FAMILY_DUPLICATION below for why it's a max, not a site-wide sum
 *      or mean).
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
 * WHAT "SHARED STYLESHEET" MEANS SINCE ARCH-13 (2026-09-04)
 * --------------------------------------------------------
 * The paragraphs above were written when the utilities layer was one repo-wide
 * compilation inlined identically into every page. It is now five: one entry sheet
 * per page family in src/styles/ (homePage, toolPage, contentPage, licensesPage,
 * notFoundPage), each compiling with `source(none)` and an explicit @source list,
 * each importing global.css - which still holds the tokens, element defaults and
 * role classes every page needs, and is still the tier paid for 22 times. Every
 * page imports exactly one entry sheet, so nothing is inlined twice into one page.
 * The three numbers below are unchanged in definition and still measure the same
 * defect; only the scope of "paid for by everyone" narrowed from the site to a
 * family. See src/styles/toolPage.css for the ownership note.
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

// DEBT-12 (2026-09-15): the duplication ratchet is the share of the site's
// distinct CSS that the HEAVIEST page family ships per page. Families are the
// pages that inline the same entry sheet (src/styles/, one per family per
// styling.md), detected by hashing each page's largest <style> block rather
// than a hand-maintained map, so a page can't drift out of the map that names
// it. The number is max over families of (family mean shipped bytes per page /
// distinct rule bytes) - MAX_FAMILY_DUPLICATION.
//
// It replaced MAX_DUPLICATION_FACTOR (total shipped / distinct), which summed
// across all pages and so grew whenever a page shipped, regardless of that
// page's own CSS discipline; it was raised three times in five weeks
// (6.78x -> 9.92x), the opposite of a ratchet that "only ever goes down"
// (CLAUDE.md). A site-wide mean per page was tried first and rejected the
// same day: one below-average page moved it -0.96%, and a heavy localized
// tool edition would have moved it +4.4% against ~2.4% of headroom. A sum
// over families was tried next and rejected too: every tool page is its own
// family (each island's CSS Modules differ), so the first new tool or
// localized tool edition would have added a term and forced a raise. The max
// has neither problem: a page joining an existing family moves that family's
// mean by bytes, a new family lighter than the heaviest changes nothing, and
// the number goes up only when the heaviest family's sheet grows (or a new
// family ships more CSS per page than any existing one, which is a nameable
// event), and down when that sheet is narrowed. Lighter families growing
// unnoticed is what the per-page dead-bytes and single-page-utility ratchets
// below are for.
//
// Measured on the 41-page tree, 15 families (one content family with 21
// members; a compress/compress-image pair; the three Hebrew tool pages, which
// share one bundle and are the heaviest; the two home editions; the three
// trust pages; ten single-page families): heaviest /he/compress/ at
// 126,153 mean shipped bytes/page over 196,732 distinct = 0.6412x (see
// `node scripts/check-css-duplication.js` for the live per-family table). A
// throwaway content page (a copy of how-to-sign-a-pdf-on-mac.yaml, registered
// in contentPages.js, built, then deleted) joined the 21-member content
// family and moved the old total/distinct factor 9.2137x -> 9.3481x (+1.46%),
// the content family's own mean by three bytes, and this number by 0.
//
// Two facts about how distinct rule bytes get computed, unrelated to page
// count but still true: `.github/skills/`'s rule tables are excluded from
// Tailwind's scan by an `@source not` rule in global.css, so they cannot
// inflate this number with classes no page uses. Tailwind's `/*! tailwindcss
// ... */` banner comment sits glued to `@layer properties`'s prelude, which
// is why `stripComments()` exists below - without it the whole properties
// layer parses as one dead leaf rule.
//
// Limit: the smallest two-decimal value above the measured 0.6412x.
const MAX_FAMILY_DUPLICATION = 0.65;
// Lowered (29,000 -> 27,500) on 2026-08-29 to bank most of two fixes that took
// /licenses/ from 29,021 (red) to 26,635, neither of which was a style change:
//   - 905 distinct bytes of utilities were being compiled out of the impeccable
//     plugin's rule tables under .github/skills/, which now has an `@source not`
//     rule in global.css. x22 pages, that was ~20KB shipped for classes no page
//     uses, and 118 brotli bytes on /sign/.
//   - 1,557 bytes per page were this script's own mis-parse: Tailwind's banner
//     comment sits immediately before `@layer properties`, the comment was glued
//     to the prelude, the `@` test failed, and the whole properties layer was
//     charged as one dead leaf rule. See stripComments() below.
// Deliberately not set to the bone at ~26,800: the localization work in flight
// is still adding components, and every new utility anywhere on the site lands
// in this number. 27,500 banks ~1,500 of the ~2,400 recovered and leaves ~865
// for that work. Tighten it once localization settles.
//
// Raised to 27,750 on 2026-09-03. The /licenses/ page is a low-traffic legal
// reference page and, at 27,683 dead bytes, exceeded the former limit by only
// 183 bytes. This narrowly accommodates that page without weakening the
// site-wide duplication or single-page utility ratchets.
//
// Lowered (27,750 -> 10,000) on 2026-09-04 by the same ARCH-13 change. This is
// the metric the split was aimed at: a page's dead bytes were dominated by the
// other families' utilities, so /licenses/ measured 27,308 for a page that
// renders 46 distinct classes. It now measures 1,100. The worst page is
// /split/ at 7,567 (5,025 utilities its eight sibling tool pages need, 2,542
// global), and the residue is real: a family sheet is the union of its family's
// markup, so a page still carries what its siblings render. Driving that to
// zero would mean a stylesheet per page, which trades the last few KB for 22
// compilations and no shared browser cache. 10,000 leaves ~24% headroom.
const MAX_PAGE_DEAD_BYTES = 10_000;
// Unchanged by ARCH-13 (144 before and after - usage did not move), but its
// blast radius did: a single-page utility now ships to its family, not to all
// 22 pages, so one on /licenses/ costs one page and one in the tool family
// costs nine. Still worth watching, and still the number that moves when
// someone reaches for a one-off utility, but read the failure message with
// that in mind.
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
/*
 * Comments are skipped while scanning but do not move `preludeStart`, so a rule
 * preceded by one has the comment glued to the front of its prelude. That is not
 * cosmetic: Tailwind's output opens with `/*! tailwindcss v4.x | MIT ... *\/`
 * immediately before `@layer properties{...}`, so the prelude did not start with
 * `@`, GROUPING_AT_RULES never matched, and the ENTIRE properties layer was
 * treated as one leaf rule. classesInSelector then read `3`, `2` and `com` out of
 * "v4.3.2" and "tailwindcss.com", matched none of them against the page, and
 * charged the whole block to that page as dead - 1,557 bytes, on every page,
 * roughly two thirds of the "global" dead figure. This is the same trap the
 * PARSING NOTE above describes, reached by the one path it did not anticipate.
 */
const stripComments = (value) => value.replace(/\/\*[\s\S]*?\*\//g, '');

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
      const prelude = stripComments(css.slice(preludeStart, i)).trim();
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

  const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const css = styleBlocks.join('');
  totalRawStyleBytes += Buffer.byteLength(css, 'utf8');

  // Family detection (DEBT-12): the largest <style> block on a page is Astro's
  // inlined page-family entry sheet (toolPage.css, contentPage.css, etc, see
  // styling.md); a small second block seen on many pages is a trivial shared
  // fragment, never the largest. Pages whose largest block is byte-identical
  // share a family - hashed rather than compared by size so two same-sized but
  // different sheets can't collide.
  const largestBlock = styleBlocks.reduce((a, b) => (Buffer.byteLength(b, 'utf8') > Buffer.byteLength(a, 'utf8') ? b : a), '');
  const familyHash = createHash('sha256').update(largestBlock, 'utf8').digest('hex').slice(0, 16);

  const page = {
    label,
    familyHash,
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

// Group pages by familyHash (the hash of each page's largest <style> block, i.e.
// its inlined page-family entry sheet - see where familyHash is computed above).
// A family is named by its lexicographically smallest member label, so the name
// is derived, not hand-maintained, and cannot drift out of sync with a rename.
const familyGroups = new Map(); // familyHash -> page[]
for (const page of pages) {
  if (!familyGroups.has(page.familyHash)) familyGroups.set(page.familyHash, []);
  familyGroups.get(page.familyHash).push(page);
}
const families = [...familyGroups.values()]
  .map((members) => {
    const totalShipped = members.reduce((sum, page) => sum + page.shippedBytes, 0);
    const meanShippedBytesPerPage = totalShipped / members.length;
    return {
      name: members.map((page) => page.label).sort()[0],
      pageCount: members.length,
      meanShippedBytesPerPage,
      shareOfDistinct: meanShippedBytesPerPage / distinctRuleBytes,
    };
  })
  .sort((a, b) => b.shareOfDistinct - a.shareOfDistinct);

// The heaviest family's share (see MAX_FAMILY_DUPLICATION): a page joining a
// family moves that family's mean by bytes, a lighter new family changes
// nothing, so this moves only when a family's sheet itself changes.
const familyDuplication = families.length > 0 ? families[0].shareOfDistinct : 0;

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
  `  Family duplication:     ${familyDuplication.toFixed(2)}x  (heaviest of ${families.length} families, ${kb(distinctRuleBytes)} distinct, limit ${MAX_FAMILY_DUPLICATION.toFixed(2)}x)`,
);
console.log('  Per family (name = lexicographically smallest member label):');
for (const family of families) {
  console.log(
    `    ${family.name.padEnd(38)} ${String(family.pageCount).padStart(2)} page(s), ${kb(Math.round(family.meanShippedBytesPerPage)).padStart(14)} mean shipped/page, ${(family.shareOfDistinct * 100).toFixed(2)}% of distinct`,
  );
}
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
if (familyDuplication > MAX_FAMILY_DUPLICATION) {
  const heaviest = families[0]; // sorted by shareOfDistinct, descending
  failures.push(
    `Family duplication ${familyDuplication.toFixed(2)}x exceeds ${MAX_FAMILY_DUPLICATION.toFixed(2)}x: ` +
      `the "${heaviest.name}" family (${heaviest.pageCount} page(s)) ships ` +
      `${kb(Math.round(heaviest.meanShippedBytesPerPage))} per page, that share of all the distinct CSS on the site. ` +
      'A rule its pages do not need has joined their sheet: scope it to the pages that use it; never raise this limit.',
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
      'Every one of them ships to every page in that page\'s family, not just the page using it. ' +
      `First few: ${shown.join(', ')}`,
  );
}

if (failures.length > 0) {
  console.error('\nCSS duplication check failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('CSS duplication check passed.');
