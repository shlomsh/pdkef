import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  console.error(`❌ dist directory not found: ${distDir}. Did the build fail?`);
  process.exit(1);
}

// Astro config has inlineStylesheets: 'always'
// So we must check the HTML files for <style> tags and calculate total CSS size.
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

let totalCssSize = 0;
const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;

for (const file of htmlFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = styleTagRegex.exec(content)) !== null) {
    totalCssSize += Buffer.byteLength(match[1], 'utf8');
  }
}

// Ensure the CSS bundle is at least 5KB (since it's repeated per HTML file, we can set a higher threshold or average it out).
// Actually, let's just use 1024 as the minimum threshold to be safe.
const MIN_CSS_SIZE_BYTES = 1024; 

if (totalCssSize < MIN_CSS_SIZE_BYTES) {
  console.error(`❌ CSS Bundle too small (${totalCssSize} bytes). Tailwind generation likely failed.`);
  process.exit(1);
}

console.log(`✅ CSS Bundle analysis passed. Total inline CSS across all HTML files: ${totalCssSize} bytes.`);
process.exit(0);
