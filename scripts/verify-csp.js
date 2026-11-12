import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { JSDOM } from 'jsdom';
import { analyticsEnv, analyticsOrigin } from './analyticsOrigin.mjs';

const distDir = path.join(process.cwd(), 'dist');

function isGoogleVerificationFile(file, content) {
  const baseName = path.basename(file);
  return /^google[a-z0-9]+\.html$/i.test(baseName)
    && content.trim() === `google-site-verification: ${baseName}`;
}

function findHtmlFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findHtmlFiles(filePath, fileList);
    } else if (filePath.endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const htmlFiles = findHtmlFiles(distDir);
let hasError = false;

// Files in dist/ that are copied verbatim out of public/ rather than rendered by
// Astro, so no CSP meta tag is ever injected into them and none is expected.
// Everything else must carry one: a page that has lost its tag is not "unhashed",
// it is unprotected, and the whole point of this gate is that that fails the build.
const NO_CSP_EXPECTED = new Set([
  // Google Search Console verification token - a one-line text file named .html.
  'google2c4730f55b90649a.html',
]);

for (const file of htmlFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  // Google verifies this file's exact bytes. It is an intentional, bare
  // passthrough rather than an Astro document, so it has no CSP to verify.
  if (isGoogleVerificationFile(file, content)) continue;
  const dom = new JSDOM(content);
  const document = dom.window.document;

  // Astro emits the attribute value lower-cased (http-equiv="content-security-policy").
  // The selector still matches, because http-equiv is one of the attributes the HTML
  // spec matches ASCII case-insensitively in selectors - but a hand-run
  // `grep "Content-Security-Policy" dist/index.html` finds nothing and looks exactly
  // like the tag has vanished site-wide. Grep with -i.
  const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (!cspMeta) {
    const relative = path.relative(process.cwd(), file);
    if (NO_CSP_EXPECTED.has(path.basename(relative))) continue;
    console.error(`[ERROR] ${relative}: no CSP meta tag at all. Astro's security.csp did not run for this page, so it ships with no policy.`);
    hasError = true;
    continue;
  }

  const cspContent = cspMeta.getAttribute('content');
  const cspDirectives = cspContent.split(';').map(s => s.trim()).filter(Boolean);

  const getHashes = (directiveName) => {
    const directive = cspDirectives.find(d => d.split(/\s+/)[0] === directiveName);
    if (!directive) return [];
    return directive.split(/\s+/).slice(1)
      .filter(token => token.startsWith("'sha256-") && token.endsWith("'"))
      .map(token => token.slice(1, -1)); // remove surrounding quotes
  };

  // A page that widens script-src for one origin can drop the base 'self' (MERGE-25: /drive/ did, and its own
  // island was blocked), so every page must still allow its own bundled scripts.
  const scriptSrc = cspDirectives.find(d => d.startsWith('script-src'));
  if (!scriptSrc || !scriptSrc.split(/\s+/).includes("'self'")) {
    console.error(`[ERROR] ${path.relative(process.cwd(), file)}: CSP script-src is missing 'self', so the page's own scripts are blocked!`);
    hasError = true;
  }

  const allowedScriptHashes = new Set(getHashes('script-src'));
  const allowedStyleHashes = new Set(getHashes('style-src'));

  // verify scripts
  const scripts = Array.from(document.querySelectorAll('script'));
  for (const script of scripts) {
    if (script.hasAttribute('src')) continue;
    // Data blocks are not executable, so script-src does not govern them.
    if (['application/ld+json', 'application/json'].includes(script.getAttribute('type'))) continue;
    
    const text = script.textContent;
    const hash = 'sha256-' + crypto.createHash('sha256').update(text).digest('base64');
    
    if (!allowedScriptHashes.has(hash)) {
      console.error(`[ERROR] ${path.relative(process.cwd(), file)}: Inline script hash ${hash} is missing from CSP script-src!`);
      hasError = true;
    }
  }

  // verify styles
  const styles = Array.from(document.querySelectorAll('style'));
  for (const style of styles) {
    const text = style.textContent;
    const hash = 'sha256-' + crypto.createHash('sha256').update(text).digest('base64');

    if (!allowedStyleHashes.has(hash)) {
      console.error(`[ERROR] ${path.relative(process.cwd(), file)}: Inline style hash ${hash} is missing from CSP style-src!`);
      hasError = true;
    }
  }

  // verify no literal style="..." attributes (CSP style-src has no 'unsafe-inline'/style-src-attr)
  const styledElements = Array.from(document.querySelectorAll('[style]'));
  for (const el of styledElements) {
    const snippet = el.outerHTML.slice(0, 150);
    console.error(`[ERROR] ${path.relative(process.cwd(), file)}: <${el.tagName.toLowerCase()}> has a literal style="..." attribute, which CSP style-src blocks at parse time: ${snippet}`);
    hasError = true;
  }
}

// MERGE-25: the Google origins belong to /drive/ alone and must appear in no other page's CSP.
const GOOGLE_ORIGINS = [
  'https://accounts.google.com',
  'https://www.googleapis.com',
  'https://apis.google.com',
  'https://docs.google.com',
  'https://drive.google.com',
  'https://content.googleapis.com',
];
// SEO-59: the video's player, a frame made after a person presses play. Only the pages with the video may allow it.
const VIDEO_PLAYER_ORIGIN = 'https://www.youtube-nocookie.com';
const videoPages = [path.join(distDir, 'index.html'), path.join(distDir, 'redact', 'index.html')];
const drivePage = path.join(distDir, 'drive', 'index.html');
if (!fs.existsSync(drivePage)) {
  console.error('[ERROR] dist/drive/index.html is missing: the /drive/ page is required.');
  hasError = true;
}
// MEM-45: connect-src is 'self' everywhere, plus the one analytics origin when the build set PUBLIC_ANALYTICS_HOST.
// analyticsOrigin() throws on a mistyped variable, which fails this script loudly.
const analytics = analyticsOrigin(analyticsEnv());
for (const file of htmlFiles) {
  if (isGoogleVerificationFile(file, fs.readFileSync(file, 'utf-8'))) continue;
  const csp = new JSDOM(fs.readFileSync(file, 'utf-8')).window.document
    .querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';
  const relative = path.relative(process.cwd(), file);
  // DRIVE-01: the Picker's own styles need 'unsafe-inline' for style elements, on /drive/ alone.
  const styleElem = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('style-src-elem')) ?? '';
  if (file !== drivePage && styleElem.includes("'unsafe-inline'")) {
    console.error(`[ERROR] ${relative}: CSP allows 'unsafe-inline' in style-src-elem, which only dist/drive/index.html may.`);
    hasError = true;
  }
  const frameSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('frame-src')) ?? '';
  if (videoPages.includes(file) && frameSrc !== `frame-src ${VIDEO_PLAYER_ORIGIN}`) {
    console.error(`[ERROR] ${relative}: CSP frame-src must be exactly ${VIDEO_PLAYER_ORIGIN}, which the video needs.`);
    hasError = true;
  } else if (!videoPages.includes(file) && csp.includes(VIDEO_PLAYER_ORIGIN)) {
    console.error(`[ERROR] ${relative}: CSP contains ${VIDEO_PLAYER_ORIGIN}, which only the pages with the video may allow.`);
    hasError = true;
  }
  const connectSrc = csp.split(';').map((d) => d.trim()).find((d) => d.split(/\s+/)[0] === 'connect-src');
  if (connectSrc === undefined) {
    console.error(`[ERROR] ${relative}: CSP has no connect-src directive.`);
    hasError = true;
  } else if (file === drivePage) {
    const tokens = connectSrc.split(/\s+/).slice(1);
    const allowed = new Set(["'self'", ...GOOGLE_ORIGINS, ...(analytics ? [analytics] : [])]);
    const stray = tokens.filter((t) => !allowed.has(t));
    if (!tokens.includes("'self'") || stray.length > 0 || (analytics && !tokens.includes(analytics))) {
      console.error(`[ERROR] ${relative}: CSP connect-src must be 'self', the Google origins${analytics ? ` and ${analytics}` : ''} only, got: ${connectSrc}`);
      hasError = true;
    }
  } else {
    const expected = analytics ? `connect-src 'self' ${analytics}` : "connect-src 'self'";
    if (connectSrc !== expected) {
      console.error(`[ERROR] ${relative}: CSP connect-src must be exactly ${expected}, got: ${connectSrc}`);
      hasError = true;
    }
  }
  for (const origin of GOOGLE_ORIGINS) {
    const present = csp.includes(origin);
    if (file === drivePage && !present) {
      console.error(`[ERROR] ${relative}: CSP is missing ${origin}, which the Drive page needs.`);
      hasError = true;
    } else if (file !== drivePage && present) {
      console.error(`[ERROR] ${relative}: CSP contains ${origin}, which only dist/drive/index.html may allow.`);
      hasError = true;
    }
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log(`✅ Verified CSP hashes in ${htmlFiles.length} HTML files.`);
}
