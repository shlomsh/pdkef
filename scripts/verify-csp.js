import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { JSDOM } from 'jsdom';

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
    const directive = cspDirectives.find(d => d.startsWith(directiveName));
    if (!directive) return [];
    return directive.split(/\s+/).slice(1)
      .filter(token => token.startsWith("'sha256-") && token.endsWith("'"))
      .map(token => token.slice(1, -1)); // remove surrounding quotes
  };

  const allowedScriptHashes = new Set(getHashes('script-src'));
  const allowedStyleHashes = new Set(getHashes('style-src'));

  // verify scripts
  const scripts = Array.from(document.querySelectorAll('script'));
  for (const script of scripts) {
    if (script.hasAttribute('src')) continue;
    if (script.getAttribute('type') === 'application/ld+json') continue;
    
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

if (hasError) {
  process.exit(1);
} else {
  console.log(`✅ Verified CSP hashes in ${htmlFiles.length} HTML files.`);
}
