// MEM-37 spike: a request per file is what Vercel bills, and after bundling most client entries are
// one-line stubs: `import"../shared/site.js";` for a page script, `export{t as default}from"../shared/x.js";`
// for an island. This post-build step (runs after `astro build`, before the precache manifest) points
// the page straight at the file the stub imports:
//   - `<script type="module" src=stub>`: the first stub naming a target becomes a script for the target;
//     later stubs for a target already loaded on that page are removed. Module evaluation order is
//     unchanged: a module graph evaluates in first-reference order, which is what is kept.
//   - `<astro-island component-url=stub component-export=default>`: component-url becomes the chunk and
//     component-export the chunk's own export name (Astro reads `module[componentExport]`).
//   renderer-url stays: the island runtime destructures `default` from it, which the shared chunk lacks.
// Stub files nothing references any more are deleted. CSP is untouched: every tag stays `src` on 'self'.
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.join(process.cwd(), 'dist');
const SIDE_EFFECT_STUB = /^import\s*"([^"]+)";?$/;
const RE_EXPORT_STUB = /^export\s*\{([^}]*)\}\s*from\s*"([^"]+)";?$/;

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const toUrl = (file) => '/' + path.relative(distDir, file).split(path.sep).join('/');
const fromUrl = (url) => path.join(distDir, url.replace(/^\//, ''));
const readStub = (url) => {
  const file = fromUrl(url.split(/[?#]/)[0]);
  if (!fs.existsSync(file) || !/\.m?js$/.test(file)) return null;
  const code = fs.readFileSync(file, 'utf8').trim();
  const resolve = (spec) => toUrl(path.resolve(path.dirname(file), spec));
  const side = SIDE_EFFECT_STUB.exec(code);
  if (side) return { kind: 'side', target: resolve(side[1]) };
  const re = RE_EXPORT_STUB.exec(code);
  if (re) {
    const exports = re[1].split(',').map((part) => part.trim().split(/\s+as\s+/));
    const def = exports.find(([, exported]) => exported === 'default');
    return { kind: 'reexport', target: resolve(re[2]), defaultLocal: def?.[0], count: exports.length };
  }
  return null;
};

export function rewriteHtml(html, stubOf) {
  const loaded = new Set();
  let out = html.replace(/<script type="module" src="([^"]+)"><\/script>/g, (tag, src) => {
    const stub = stubOf(src);
    const target = stub?.kind === 'side' ? stub.target : src;
    if (loaded.has(target)) return '';
    loaded.add(target);
    return target === src ? tag : `<script type="module" src="${target}"></script>`;
  });
  out = out.replace(/(<astro-island\b[^>]*?)\scomponent-url="([^"]+)"([^>]*?)\scomponent-export="([^"]+)"/g, (whole, a, url, b, exp) => {
    const stub = stubOf(url);
    if (stub?.kind !== 'reexport' || exp !== 'default' || !stub.defaultLocal) return whole;
    return `${a} component-url="${stub.target}"${b} component-export="${stub.defaultLocal}"`;
  });
  return out;
}

export function dropStubRequests() {
  const files = walk(distDir);
  const htmlFiles = files.filter((f) => f.endsWith('.html'));
  const cache = new Map();
  const stubOf = (url) => (cache.has(url) ? cache.get(url) : (cache.set(url, readStub(url)), cache.get(url)));
  let changed = 0;
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    const next = rewriteHtml(html, stubOf);
    if (next !== html) { fs.writeFileSync(file, next); changed++; }
  }
  // Delete a stub only when no remaining file mentions it by name.
  const remaining = walk(distDir).filter((f) => /\.(?:html|m?js)$/.test(f));
  const text = remaining.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  let removed = 0;
  for (const [url, stub] of cache) {
    if (!stub) continue;
    if (!text.includes(url) && !text.includes(`./${path.posix.basename(url)}`)) {
      fs.rmSync(fromUrl(url)); removed++;
    }
  }
  console.log(`Stub requests: rewrote ${changed} pages, deleted ${removed} stub files.`);
}

if (import.meta.url === `file://${process.argv[1]}`) dropStubRequests();
