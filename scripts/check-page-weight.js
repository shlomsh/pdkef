import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '..', 'dist');

/*
 * Budgets what a visitor downloads before the page is usable: the document
 * (HTML plus the CSS Astro inlines into it) plus the JS that document eagerly
 * references, brotli-compressed, per page.
 *
 * This replaces check-css-bundle.js, which was scaffolding for a migration that
 * has since finished. That guard was added under E1.3 "so the global stylesheet
 * can't silently regrow past a threshold" - a proxy for "the CSS monolith is
 * being dismantled, not fed" while E2/E3 moved styles into CSS Modules and
 * Tailwind. The migration landed, and the invariant it was proxying for is now
 * asserted directly and exactly by check-editor-global-css.js (0 editor
 * selectors in global.css), with correctness covered by
 * check-class-resolution.js and check-dead-utilities.js. A size cap on one
 * asset type had nothing left to catch that those three don't.
 *
 * It also had a scope error worth not inheriting. Measured 2026-08-14 on /sign/,
 * the heaviest page:
 *
 *     document (HTML + inlined CSS)   23,910 brotli   of which CSS is 12,738
 *     eagerly referenced JS           16,074 brotli
 *     first load                      39,984 brotli
 *
 * The old guard watched the 12,738 and ignored the 16,074. CSS is the smaller,
 * more compressible, and far more inert half - utility CSS compresses ~6:1 and
 * grows in small increments. The JS is the half that regresses violently and
 * silently: one static import that should have been dynamic pulls a PDF library
 * into the island chunk, and nothing here would have said a word. This codebase
 * already has form on exactly that axis (see CLAUDE.md on vite.optimizeDeps and
 * the dynamic-import cascade).
 *
 * "Eagerly referenced" starts from every /_astro/*.js the built HTML names
 * directly - the astro-island's component-url and renderer-url - and then
 * walks the REAL static-import graph from there, recursively, summing every
 * chunk reached by a plain `import`/`export ... from` edge. Chunks reached
 * only through a runtime import() (pdfjs, fontkit, the font TTFs, SortableJS)
 * are deliberately NOT walked into: they load after first paint, behind a user
 * action, which is the whole point of splitting them out.
 *
 * The graph walk exists because a literal string match against the HTML - what
 * this script did before - only sees the one or two chunks Astro names in the
 * `<astro-island>` tag itself (component-url, renderer-url). Every module those
 * chunks import statically is invisible to that regex even though the browser
 * fetches it eagerly during hydration, because Astro's static-HTML output never
 * names it - only the JS chunk that imports it does. Measured on /sign/,
 * 2026-08-29: the two HTML-named chunks total 62KB raw, but PdfSignTool's own
 * chunk statically imports `useCurrentPage.*.js` (928KB raw - most of the
 * island's own logic), which itself statically imports `es.*.js` (584KB raw -
 * @cantoo/pdf-lib), neither of which the old regex ever saw. The old method
 * reported ~17KB brotli of "eager JS" for a page that, empirically watching a
 * real load, fetches well over 500KB brotli of JS before the tool is usable.
 * This was not a Vite bundling problem - static imports really do get fetched
 * eagerly, correctly - it was this script only looking at the HTML text
 * instead of the module graph the HTML's two named entry chunks pull in.
 *
 * IMAGES ARE A SECOND, SEPARATE BUDGET, and they are here because their absence
 * cost real bytes for months. The brand logo shipped as <img src="/favicon.png">,
 * a 512x512 PNG of 153,946 bytes, painted at 24px in the app bar on 18 of the 21
 * pages. Every first visit from search paid ~150KB for a 24px square, and this
 * script - the one guard whose entire job is "what does a visitor download
 * before the page is usable" - said nothing, because it only ever looked at
 * .js. A budget that watches the two lightest asset types and ignores the
 * heaviest one is not a page-weight budget.
 *
 * Three deliberate choices in how images are counted:
 *
 *   Raw bytes, not brotli. WebP/JPEG/PNG are already compressed and Vercel
 *   serves them as-is, so brotli-ing them here would report a number no
 *   visitor ever experiences. The doc and JS stay brotli because those really
 *   are served compressed. The columns therefore mix units on purpose: each
 *   one is the bytes that actually cross the wire.
 *
 *   The largest srcset candidate, not the src. A browser downloads exactly one
 *   candidate, and on the retina displays most visitors have that is the 2x. A
 *   budget should measure the worst realistic case, not the cheapest one.
 *
 *   loading="lazy" is excluded, anything else is counted. Absent means eager
 *   per spec, so the default is to count it. Favicons and manifest icons are
 *   also excluded: the browser picks one, fetches it once for the whole origin,
 *   and it is not part of any single page's render path.
 *
 * Images referenced from CSS url() are NOT counted - there are none today, and
 * whether a rule that mentions one actually matches is not decidable from the
 * stylesheet alone. If a background image ever ships, it will be invisible here.
 *
 * The two budgets stay separate rather than summing into one first-load number,
 * for the same reason the file argues against merging a ratchet with a budget
 * below: a JS regression and an image regression have different causes and
 * different fixes, and one number would let a win on either side hide a loss on
 * the other. The combined figure is printed for context and enforces nothing.
 *
 * NOT A RATCHET. Page weight legitimately grows when features ship, so this
 * carries real headroom (48,000 against a measured 39,984, ~20%) and should be
 * raised deliberately when a feature needs it, saying what shipped. The hard
 * ratchets live in check-css-duplication.js, where duplication factor, dead
 * bytes and single-page utilities each measure a mistake rather than a feature,
 * and where "only ever improves" is the correct rule. Keeping those two ideas in
 * one number is what left the old cap with 677 bytes of headroom and no way out
 * but raising it.
 */

// Worst measured page is /sign/ at 48,863 brotli (31,230 document + 17,633 JS).
//
// Raised from 48,000 on 2026-08-28, deliberately and for a feature, which is
// what this budget is for (see the header above - it is not a ratchet). Two
// things moved it. It was already 135 bytes over at the previous commit, from
// the Languages card work; then Punjabi, Telugu and Tamil landed, and each new
// language is a card entry whose note explains what actually works in that
// script - the Punjabi and Telugu ones also have to explain why the font is
// not that script's Noto face (see CLAUDE.md's font section). That is 728
// bytes brotli of static, crawlable copy on the one page it belongs on, which
// is the SEO surface earning its keep rather than a regression.
//
// The JS half has not moved at all (17,633 both before and after): the fonts
// themselves are fetched on demand and never counted here, so adding a script
// costs page weight only in the copy that describes it.
// TEMPORARY - 2026-08-29, raised 49,500 -> 50,500 to unblock, NOT a considered
// budget increase. Revisit as soon as the documentation-localization work lands.
//
// /sign/ measured 49,832 (32,814 document + 17,018 eager JS), 332 over. The JS
// half went DOWN by 615; the document half went up ~1,536 because the in-flight
// localization work now puts a documentation-coverage block and 10 hreflang tags
// on /sign/. That work is unfinished, so there is no honest "here is what
// shipped and it is worth the bytes" statement to write yet, which is what this
// budget's header asks for before a raise. 50,500 leaves ~670 bytes of room to
// keep working and nothing more.
//
// What is owed when that work settles: re-measure, then either state what the
// localization surface costs on /sign/ and set the number deliberately, or put
// it back to 49,500 if the coverage block does not belong on the tool page's
// first load. Do not let this line calcify into the new normal - the 2026-08-28
// entry below is what a considered raise looks like.
//
// 2026-08-29 - METHODOLOGY FIX, not a feature raise; every entry above this one
// was computed by a script that undercounted eager JS (see the header comment
// above "Eagerly referenced starts from..."). Once the guard actually walks the
// static-import graph instead of text-matching the HTML, /sign/ measures
// 584,496 (32,931 document + 551,565 eager JS) - the JS figure was always
// close to this; the old ~17,000 number never reflected what the browser
// downloads, because it only ever saw the one or two chunks named in the
// astro-island tag and missed everything those chunks import. Nothing about
// the shipped page changed between the previous measurement and this one.
//
// SIGN-14 completed that split on 2026-09-02. The static Sign entry no longer
// imports the export adapter or its PDF serializer; those load only after the
// user chooses Download. The heaviest first load fell from roughly 582KB to
// 325KB brotli. Keep generous feature headroom without letting that lazy
// boundary disappear unnoticed.
// SIGN-14 split the export adapter from editor hydration on 2026-09-02. The
// heaviest first load fell from roughly 582KB to 325KB brotli; keep generous
// feature headroom without allowing the lazy PDF serializer to become eager
// again unnoticed.
const MAX_FIRST_LOAD_BROTLI = 400_000;

// Worst measured page is / at 4,586 raw bytes: the app bar logo (1,342 at 2x)
// plus the home hero logo (3,244 at 2x). Every other page carries the app bar
// alone. The limit is deliberately close - roughly 3x headroom - because this
// site has no photography by design, so the realistic ways this number moves
// are a genuine new asset (raise it, and say what shipped) or an unoptimised
// one landing on the critical path (the regression). For scale, the defect
// this was written after would have blown it by more than 10x.
const MAX_EAGER_IMAGE_BYTES = 15_000;

if (!fs.existsSync(distDir)) {
  console.error(`dist directory not found: ${distDir}. Run npm run build first.`);
  process.exit(1);
}

function getHtmlFiles(dir, fileList = []) {
  for (const entry of fs.readdirSync(dir)) {
    const filePath = path.join(dir, entry);
    if (fs.statSync(filePath).isDirectory()) getHtmlFiles(filePath, fileList);
    // dist/google*.html is the Search Console verification file: a bare string
    // with no head, no CSS and no scripts. It is not a page anyone loads.
    else if (filePath.endsWith('.html') && !path.basename(filePath).startsWith('google')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const brotliCache = new Map();
function brotliOf(absPath) {
  const cached = brotliCache.get(absPath);
  if (cached !== undefined) return cached;
  const bytes = zlib.brotliCompressSync(fs.readFileSync(absPath), {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
  brotliCache.set(absPath, bytes);
  return bytes;
}

const brotli = (buffer) =>
  zlib.brotliCompressSync(buffer, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;

// Static import/export edges only - "from '...'" is JS syntax exclusively for
// `import ... from` and `export ... from`, never for a dynamic `import(...)`
// call (which has no `from`). Rollup's build output always writes these as
// plain quoted string literals, never template literals, so this is a safe,
// dependency-free stand-in for a real module-graph walk (no es-module-lexer
// needed - Rollup already decided the graph, this just reads its output back).
const STATIC_IMPORT_RE = /\bfrom\s*["']([^"']+\.[cm]?js)["']/g;

// Every chunk reachable from `entryFiles` by a static import/export edge,
// recursively - the actual set of JS the browser fetches before an eagerly-
// hydrated island runs, as opposed to only the chunk(s) named in the HTML.
// Returns a Map of absolute path -> brotli bytes, deduped by file so a chunk
// shared between multiple entries (or multiple pages, via the shared
// brotliOf cache) is measured once.
function eagerImportGraph(entryFiles) {
  const visited = new Map();
  const stack = [...entryFiles];
  while (stack.length) {
    const file = stack.pop();
    if (visited.has(file) || !fs.existsSync(file)) continue;
    visited.set(file, brotliOf(file));
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(STATIC_IMPORT_RE)) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue; // bundled output only ever uses relative specifiers between its own chunks
      const resolved = path.normalize(path.join(path.dirname(file), spec));
      if (!visited.has(resolved)) stack.push(resolved);
    }
  }
  return visited;
}

// One srcset candidate list -> the URLs in it. A candidate is "<url> <descriptor>"
// and descriptors never contain a comma, so splitting on commas is safe for the
// hashed, comma-free filenames Astro emits.
function srcsetUrls(value) {
  return value
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

// Every image the document makes the browser fetch before it is usable, as a
// map of resolved dist path -> bytes. Deduped by URL, because two elements
// pointing at the same file cost one download.
function eagerImages(html) {
  const found = new Map();

  const consider = (urls) => {
    // A browser picks exactly one candidate; assume the largest (see header).
    let worstPath = null;
    let worstBytes = -1;
    for (const url of urls) {
      if (!url.startsWith('/')) continue; // data: URIs and off-origin: not our bytes
      const assetPath = path.join(distDir, url.split('?')[0]);
      if (!assetPath.startsWith(distDir) || !fs.existsSync(assetPath)) continue;
      const bytes = fs.statSync(assetPath).size;
      if (bytes > worstBytes) {
        worstBytes = bytes;
        worstPath = assetPath;
      }
    }
    if (worstPath) found.set(worstPath, worstBytes);
  };

  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    if (/\bloading\s*=\s*["']?lazy\b/i.test(tag)) continue;
    const srcset = tag.match(/\bsrcset\s*=\s*"([^"]*)"/i);
    const src = tag.match(/\bsrc\s*=\s*"([^"]*)"/i);
    consider(srcset ? srcsetUrls(srcset[1]) : src ? [src[1]] : []);
  }

  // <picture><source srcset> - unused today, but it is the other way an eager
  // image reaches the page, and a guard that misses it invites the same bug back.
  for (const [tag] of html.matchAll(/<source\b[^>]*>/gi)) {
    const srcset = tag.match(/\bsrcset\s*=\s*"([^"]*)"/i);
    if (srcset) consider(srcsetUrls(srcset[1]));
  }

  // An explicit preload is as eager as it gets.
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel\s*=\s*["']?preload\b/i.test(tag)) continue;
    if (!/\bas\s*=\s*["']?image\b/i.test(tag)) continue;
    const imagesrcset = tag.match(/\bimagesrcset\s*=\s*"([^"]*)"/i);
    const href = tag.match(/\bhref\s*=\s*"([^"]*)"/i);
    consider(imagesrcset ? srcsetUrls(imagesrcset[1]) : href ? [href[1]] : []);
  }

  return found;
}

const htmlFiles = getHtmlFiles(distDir).sort();
if (htmlFiles.length === 0) {
  console.error('No HTML files found in the build output.');
  process.exit(1);
}

const rows = [];
for (const file of htmlFiles) {
  const buffer = fs.readFileSync(file);
  const html = buffer.toString('utf8');

  const scriptRefs = [...new Set([...html.matchAll(/\/_astro\/[A-Za-z0-9._-]+\.js/g)].map((m) => m[0]))];
  const entryFiles = scriptRefs.map((ref) => path.join(distDir, ref));
  const eagerGraph = eagerImportGraph(entryFiles);
  let jsBytes = 0;
  for (const bytes of eagerGraph.values()) jsBytes += bytes;

  // Reported for context only - the budget is on the document as a whole, since
  // the CSS is inlined into it and a visitor cannot pay for one without the other.
  let css = '';
  let match;
  const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  while ((match = styleTagRegex.exec(html)) !== null) css += match[1];

  // Raw, not brotli: images are already compressed and served as-is.
  const images = eagerImages(html);
  let imgBytes = 0;
  for (const bytes of images.values()) imgBytes += bytes;

  const docBytes = brotli(buffer);
  rows.push({
    label: `/${path.relative(distDir, file).replace(/(^|\/)index\.html$/, '/').replace(/^\/+/, '')}`,
    doc: docBytes,
    js: jsBytes,
    css: css ? brotli(Buffer.from(css, 'utf8')) : 0,
    img: imgBytes,
    imgCount: images.size,
    total: docBytes + jsBytes,
    modules: eagerGraph.size,
  });
}

rows.sort((a, b) => b.total + b.img - (a.total + a.img));
const worst = rows.reduce((a, b) => (b.total > a.total ? b : a));
const worstImage = rows.reduce((a, b) => (b.img > a.img ? b : a));

console.log(
  `First-load weight, ${rows.length} pages. Document and JS are brotli; images are raw ` +
    '(already compressed, served as-is):',
);
for (const row of rows) {
  console.log(
    `  ${row.label.padEnd(16)} ${String(row.doc).padStart(6)} doc + ${String(row.js).padStart(6)} js` +
      ` + ${String(row.img).padStart(5)} img` +
      `   (css ${row.css} of doc, ${row.modules} module${row.modules === 1 ? '' : 's'},` +
      ` ${row.imgCount} image${row.imgCount === 1 ? '' : 's'})`,
  );
}

let failed = false;

if (worst.total > MAX_FIRST_LOAD_BROTLI) {
  console.error(
    `\nPage weight budget exceeded: ${worst.label} is ${worst.total} bytes brotli on first load ` +
      `(${worst.doc} document + ${worst.js} eager JS), over the ${MAX_FIRST_LOAD_BROTLI} byte limit. ` +
      'If a chunk that used to load behind a user action is now referenced by the HTML, that is the regression; ' +
      'otherwise raise the limit deliberately and say what shipped.',
  );
  failed = true;
}

if (worstImage.img > MAX_EAGER_IMAGE_BYTES) {
  console.error(
    `\nEager image budget exceeded: ${worstImage.label} fetches ${worstImage.img} raw bytes of images ` +
      `before first paint, over the ${MAX_EAGER_IMAGE_BYTES} byte limit. ` +
      'The usual cause is a full-size asset referenced at display size instead of going through ' +
      'astro:assets, or an image that should carry loading="lazy" and does not; ' +
      'otherwise raise the limit deliberately and say what shipped.',
  );
  failed = true;
}

if (failed) process.exit(1);

console.log(
  `\nPage weight check passed. Worst document+JS ${worst.label}: ${worst.total} / ${MAX_FIRST_LOAD_BROTLI} brotli. ` +
    `Worst eager images ${worstImage.label}: ${worstImage.img} / ${MAX_EAGER_IMAGE_BYTES} raw.`,
);
