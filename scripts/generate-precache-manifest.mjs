import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.join(process.cwd(), 'dist');
const manifestName = 'precache-manifest.json';
const workerName = 'sw.js';

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(filePath, files);
    else files.push(filePath);
  }
  return files;
}

function toPublicUrl(filePath) {
  const relative = path.relative(distDir, filePath).split(path.sep).join('/');
  if (relative === 'index.html') return '/';
  if (relative.endsWith('/index.html')) return `/${relative.slice(0, -'index.html'.length)}`;
  return `/${relative}`;
}

if (!fs.existsSync(distDir)) {
  throw new Error('dist/ does not exist. Run Astro build before generating the precache manifest.');
}

const files = walk(distDir)
  .filter((filePath) => {
    const relative = path.relative(distDir, filePath).split(path.sep).join('/');
    return relative !== manifestName && relative !== workerName;
  })
  .sort();

const urls = files.map(toPublicUrl);
const manifest = JSON.stringify({ urls }, null, 2);
const buildId = crypto.createHash('sha256').update(manifest).digest('hex').slice(0, 12);

fs.writeFileSync(path.join(distDir, manifestName), `${manifest}\n`);

const workerPath = path.join(distDir, workerName);
const worker = fs.readFileSync(workerPath, 'utf8');
if (!worker.includes('__BUILD_ID__')) {
  throw new Error('dist/sw.js is missing the __BUILD_ID__ placeholder.');
}
fs.writeFileSync(workerPath, worker.replaceAll('__BUILD_ID__', buildId));

console.log(`✅ Precaching ${urls.length} build assets (pdkef-${buildId}).`);
