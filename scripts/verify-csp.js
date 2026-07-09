import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { JSDOM } from 'jsdom';

const distDir = path.join(process.cwd(), 'dist');

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

for (const file of htmlFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const dom = new JSDOM(content);
  const document = dom.window.document;

  const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (!cspMeta) {
    console.warn(`[WARN] No CSP meta tag found in ${path.relative(process.cwd(), file)}`);
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
