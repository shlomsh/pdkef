/**
 * node scripts/measure-update-cost.mjs <beforeDist> <afterDist> [--target N]
 *
 * Reads the install set of each dist/ folder from its own precache manifest, prices what an update from the first to the second
 * downloads, prints the summary, appends it to $GITHUB_STEP_SUMMARY when set,
 * and exits 1 above the target. The arithmetic lives in updateCost.mjs.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { UPDATE_COST_TARGET, summarize, updateCost } from './updateCost.mjs';

const RAW_EXT = /\.(png|jpe?g|webp|avif|gif|woff2|pdf|zip)$/i;
const brotliQ5 = (buf) =>
  zlib.brotliCompressSync(buf, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length, [zlib.constants.BROTLI_PARAM_LGWIN]: 22 },
  }).length;

const toRel = (u) => (u === '/' ? 'index.html' : u.endsWith('/') ? `${u.slice(1)}index.html` : u.slice(1));

// The install set is what the build's own manifest lists (what public/sw.js
// appUrls precaches) plus sw.js and the manifest, hashed from the dist as built.
export function readInstallSet(dir) {
  if (!fs.existsSync(dir)) throw new Error(`Build folder ${dir} does not exist`);
  const manifestPath = path.join(dir, 'precache-manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`${dir} has no precache-manifest.json`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const urls = new Set(manifest.version === 2 ? [...manifest.shell, ...Object.values(manifest.pages).flat()] : manifest.urls);
  if (urls.size === 0) throw new Error(`The precache manifest in ${dir} is empty`);
  urls.add('/sw.js');
  urls.add('/precache-manifest.json');
  const set = new Map();
  for (const url of urls) {
    const rel = toRel(url);
    const buf = fs.readFileSync(path.join(dir, rel));
    set.set(url, { hash: crypto.createHash('sha1').update(buf).digest('hex'), bytes: RAW_EXT.test(rel) ? buf.length : brotliQ5(buf) });
  }
  return set;
}

function main(argv) {
  const args = argv.slice(2);
  const t = args.indexOf('--target');
  const target = t >= 0 ? Number(args.splice(t, 2)[1]) : UPDATE_COST_TARGET;
  const [beforeDir, afterDir] = args;
  if (!beforeDir || !afterDir || !Number.isFinite(target)) {
    console.error('usage: node scripts/measure-update-cost.mjs <beforeDist> <afterDist> [--target N]');
    process.exit(2);
  }
  let result;
  try {
    result = updateCost(readInstallSet(beforeDir), readInstallSet(afterDir));
  } catch (err) {
    console.error(err.message);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Update cost\n\n${err.message}\n`);
    process.exit(1);
  }
  const lines = summarize(result, target);
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Update cost\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`);
  }
  process.exit(result.total > target ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv);
