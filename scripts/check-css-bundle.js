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

let maxCssSize = 0;
for (const file of htmlFiles) {
  const content = fs.readFileSync(file, 'utf8');
  let pageCssSize = 0;
  let match;
  while ((match = styleTagRegex.exec(content)) !== null) {
    pageCssSize += Buffer.byteLength(match[1], 'utf8');
  }
  if (pageCssSize > maxCssSize) {
    maxCssSize = pageCssSize;
  }
}

// 80KB maximum threshold to prevent Tailwind monolith regressions.
const MAX_CSS_SIZE_BYTES = 80000; 

if (maxCssSize > MAX_CSS_SIZE_BYTES) {
  console.error(`❌ CSS Budget exceeded! Max inline CSS size is ${maxCssSize} bytes, which exceeds the threshold of ${MAX_CSS_SIZE_BYTES} bytes.`);
  process.exit(1);
}

console.log(`✅ CSS Budget check passed. Max inline CSS per page: ${maxCssSize} bytes (limit: ${MAX_CSS_SIZE_BYTES}).`);
process.exit(0);
