import fs from 'fs';
import path from 'path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error(`❌ dist directory not found: ${distDir}. Did the build fail?`);
  process.exit(1);
}

function getHtmlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getHtmlFiles(filePath, fileList);
    } else if (filePath.endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const htmlFiles = getHtmlFiles(distDir);
if (htmlFiles.length === 0) {
  console.error('❌ No HTML files found in the build output.');
  process.exit(1);
}

const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;

const brotli = (text) =>
  zlib.brotliCompressSync(Buffer.from(text, 'utf8'), {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;

let maxCssSize = 0;
let maxCompressed = 0;
let worstPage = '';
let worstPageRaw = 0;
for (const file of htmlFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let pageCss = '';
  let match;
  while ((match = styleTagRegex.exec(content)) !== null) {
    pageCss += match[1];
  }
  const pageCssSize = Buffer.byteLength(pageCss, 'utf8');
  if (pageCssSize > maxCssSize) maxCssSize = pageCssSize;

  const pageCompressed = pageCss ? brotli(pageCss) : 0;
  if (pageCompressed > maxCompressed) {
    maxCompressed = pageCompressed;
    worstPage = `/${path.relative(distDir, file).replace(/(^|\/)index\.html$/, '/')}`;
    worstPageRaw = pageCssSize;
  }
}

// Budget is the COMPRESSED size of a page's inline CSS, because that is what a
// visitor actually downloads: Vercel serves brotli, and this CSS is inlined into
// the HTML document rather than fetched separately.
//
// It used to gate on raw bytes, which priced the wrong thing. Utility CSS is the
// most repetitive content in the build and compresses ~6:1, so 5KB of near-
// duplicate utilities costs a few hundred bytes on the wire while 5KB of novel
// CSS Module rules costs several times that. The raw metric called those equal.
// Measured 2026-08-14: /sign/ is 77,823 raw -> 12,738 brotli, and the whole
// /sign/ document is 23,910 brotli, at or below the median page's CSS alone.
//
// This is deliberately NOT a ratchet, and must not be re-tightened to hug the
// current value the way the raw cap was (78,500 against 77,823 left 677 bytes,
// so the next dialog would have failed the build and the only ways out were
// unrelated CSS golf or raising the number - which trains raising the number).
// Page weight legitimately grows when features ship. A defect ratio never
// should, which is why the hard ratchets live in check-css-duplication.js and
// measure duplication/dead bytes instead. The headroom here is real headroom:
// ~2.3KB brotli, roughly a substantial feature's worth of new CSS. Raise it
// only when a real feature needs it, and say what shipped.
const MAX_CSS_BROTLI_BYTES = 15_000;

if (maxCompressed > MAX_CSS_BROTLI_BYTES) {
  console.error(`❌ CSS Budget exceeded! ${worstPage} ships ${maxCompressed} bytes of brotli-compressed inline CSS (${worstPageRaw} raw), over the ${MAX_CSS_BROTLI_BYTES} byte threshold.`);
  process.exit(1);
}

console.log(`✅ CSS Budget check passed. Worst page ${worstPage}: ${maxCompressed} bytes brotli (limit: ${MAX_CSS_BROTLI_BYTES}), ${worstPageRaw} raw. Largest raw on any page: ${maxCssSize}.`);
process.exit(0);
