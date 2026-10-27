/**
 * node scripts/measure-update-cost.mjs <beforeDist> <afterDist> [--target N]
 *
 * Builds the install set of each dist/ folder (the same closures the service
 * worker precaches), prices what an update from the first to the second
 * downloads, prints the summary, appends it to $GITHUB_STEP_SUMMARY when set,
 * and exits 1 above the target. The arithmetic lives in updateCost.mjs.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { shouldPrecache } from '../src/site-lib/precachePolicy.js';
import { pageClosure, shellClosure, toPublicUrl } from './precacheClosure.mjs';
import { UPDATE_COST_TARGET, summarize, updateCost } from './updateCost.mjs';

const RAW_EXT = /\.(png|jpe?g|webp|avif|gif|woff2|pdf|zip)$/i;
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

const brotliQ5 = (buf) =>
  zlib.brotliCompressSync(buf, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length, [zlib.constants.BROTLI_PARAM_LGWIN]: 22 },
  }).length;

const toRel = (u) => (u === '/' ? 'index.html' : u.endsWith('/') ? `${u.slice(1)}index.html` : u.slice(1));

export function readInstallSet(dir) {
  const rel = (p) => path.relative(dir, p).split(path.sep).join('/');
  const all = walk(dir).sort();
  const view = {
    files: new Map(all.filter((p) => /\.(?:html|m?js|css)$/.test(p)).map((p) => [rel(p), fs.readFileSync(p, 'utf8')])),
    paths: all.map(rel),
  };
  const keep = (r) => shouldPrecache(r, { manifestName: 'precache-manifest.json', workerName: 'sw.js' });
  const pages = {};
  for (const r of [...view.files.keys()].filter((n) => n.endsWith('.html')).sort()) pages[toPublicUrl(r)] = pageClosure(view, r, { keep });
  const shell = shellClosure(view, { keep });
  const set = new Map();
  const add = (url, relPath, buf) =>
    set.set(url, { hash: crypto.createHash('sha1').update(buf).digest('hex'), bytes: RAW_EXT.test(relPath) ? buf.length : brotliQ5(buf) });
  for (const url of new Set([...shell, ...Object.values(pages).flat()])) add(url, toRel(url), fs.readFileSync(path.join(dir, toRel(url))));
  add('/sw.js', 'sw.js', fs.readFileSync(path.join(dir, 'sw.js')));
  add('/precache-manifest.json', 'precache-manifest.json', fs.readFileSync(path.join(dir, 'precache-manifest.json')));
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
  const result = updateCost(readInstallSet(beforeDir), readInstallSet(afterDir));
  const lines = summarize(result, target);
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Update cost\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`);
  }
  process.exit(result.total > target ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
