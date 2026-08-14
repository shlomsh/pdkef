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
 * "Eagerly referenced" is every /_astro/*.js the built HTML mentions - the
 * island entry plus Astro's hydration client. Chunks reached only through a
 * runtime import() (pdfjs, fontkit, the font TTFs, SortableJS) are deliberately
 * NOT counted: they load after first paint, behind a user action, which is the
 * whole point of splitting them out. If one of those ever becomes eagerly
 * referenced it will appear in the HTML and this number will jump, which is the
 * regression worth catching.
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

// Worst measured page is /sign/ at 39,984 brotli (23,910 document + 16,074 JS).
const MAX_FIRST_LOAD_BROTLI = 48_000;

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

const brotli = (buffer) =>
  zlib.brotliCompressSync(buffer, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;

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
  let jsBytes = 0;
  for (const ref of scriptRefs) {
    const assetPath = path.join(distDir, ref);
    if (fs.existsSync(assetPath)) jsBytes += brotli(fs.readFileSync(assetPath));
  }

  // Reported for context only - the budget is on the document as a whole, since
  // the CSS is inlined into it and a visitor cannot pay for one without the other.
  let css = '';
  let match;
  const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  while ((match = styleTagRegex.exec(html)) !== null) css += match[1];

  const docBytes = brotli(buffer);
  rows.push({
    label: `/${path.relative(distDir, file).replace(/(^|\/)index\.html$/, '/').replace(/^\/+/, '')}`,
    doc: docBytes,
    js: jsBytes,
    css: css ? brotli(Buffer.from(css, 'utf8')) : 0,
    total: docBytes + jsBytes,
    modules: scriptRefs.length,
  });
}

rows.sort((a, b) => b.total - a.total);
const worst = rows[0];

console.log(`First-load weight (brotli, document + eagerly referenced JS), ${rows.length} pages:`);
for (const row of rows) {
  console.log(
    `  ${row.label.padEnd(16)} ${String(row.total).padStart(6)} total = ${String(row.doc).padStart(6)} doc + ${String(row.js).padStart(6)} js` +
      `   (css ${row.css} of doc, ${row.modules} module${row.modules === 1 ? '' : 's'})`,
  );
}

if (worst.total > MAX_FIRST_LOAD_BROTLI) {
  console.error(
    `\nPage weight budget exceeded: ${worst.label} is ${worst.total} bytes brotli on first load ` +
      `(${worst.doc} document + ${worst.js} eager JS), over the ${MAX_FIRST_LOAD_BROTLI} byte limit. ` +
      'If a chunk that used to load behind a user action is now referenced by the HTML, that is the regression; ' +
      'otherwise raise the limit deliberately and say what shipped.',
  );
  process.exit(1);
}

console.log(`\nPage weight check passed. Worst page ${worst.label}: ${worst.total} / ${MAX_FIRST_LOAD_BROTLI} bytes brotli.`);
