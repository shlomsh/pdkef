import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { main } from './check-page-weight.js';

// Each case plants a dist/ in a temp folder and runs the guard's main() on it in-process; one real CLI run (a copy of
// the script beside a planted dist/, since the CLI measures <its own folder>/../dist) proves the entry wiring.
// Random bytes do not compress, so a file's brotli size is its raw size.
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const MAX_FIRST_LOAD_BROTLI = 400_000;
const MAX_EAGER_IMAGE_BYTES = 15_000;

function plant(pages, assets = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'page-weight-'));
  for (const [rel, content] of Object.entries({ ...pages, ...assets })) {
    fs.mkdirSync(path.dirname(path.join(root, 'dist', rel)), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', rel), content);
  }
  return root;
}

async function run(pages, assets = {}) {
  const root = plant(pages, assets);
  const out = [];
  const errs = [];
  const status = await main([], { cwd: root, log: (l) => out.push(String(l)), err: (l) => errs.push(String(l)) });
  return { status, err: errs.join('\n'), out: out.join('\n') };
}

let cli;
beforeAll(() => {
  const root = plant({ 'index.html': html('<img src="/logo.png" width="24" height="24">') }, { 'logo.png': noise(2_000) });
  fs.mkdirSync(path.join(root, 'scripts'));
  for (const f of ['check-page-weight.js', 'is-entry.mjs', 'pageCss.mjs', 'precacheClosure.mjs']) {
    fs.copyFileSync(path.join(scriptsDir, f), path.join(root, 'scripts', f));
  }
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-page-weight.js')], { encoding: 'utf8' });
  cli = { status: r.status, out: r.stdout };
});

// Deterministic incompressible bytes: SHA-256 in counter mode.
const noise = (bytes) =>
  Buffer.concat(Array.from({ length: Math.ceil(bytes / 32) }, (_, i) => crypto.createHash('sha256').update(String(i)).digest())).subarray(0, bytes);
const html = (body) => `<!doctype html><html><head></head><body>${body}</body></html>`;

describe('check-page-weight', () => {
  it('runs as a CLI: exits 0 and prints the pass line', () => {
    expect(cli.status).toBe(0);
    expect(cli.out).toContain('Page weight check passed');
  });

  it('passes a light page with a small image', async () => {
    const r = await run(
      { 'index.html': html('<img src="/logo.png" width="24" height="24">') },
      { 'logo.png': noise(MAX_EAGER_IMAGE_BYTES - 1000) },
    );
    expect(r.err).toBe('');
    expect(r.status).toBe(0);
    expect(r.out).toContain('Page weight check passed');
  });

  it('fails a page whose eagerly loaded JS pushes first load over the brotli budget', async () => {
    const r = await run(
      { 'index.html': html('<script type="module" src="/_astro/entry.js"></script>') },
      { '_astro/entry.js': noise(MAX_FIRST_LOAD_BROTLI + 5_000) },
    );
    expect(r.status).toBe(1);
    expect(r.err).toContain('Page weight budget exceeded: /');
  });

  it('counts JS reached only through a static import of the entry chunk', async () => {
    const r = await run(
      { 'index.html': html('<script type="module" src="/_astro/entry.js"></script>') },
      { '_astro/entry.js': 'import "./big.js";\n', '_astro/big.js': noise(MAX_FIRST_LOAD_BROTLI + 5_000) },
    );
    expect(r.status).toBe(1);
    expect(r.err).toContain('Page weight budget exceeded');
  });

  it('does not count JS behind a dynamic import()', async () => {
    const r = await run(
      { 'index.html': html('<script type="module" src="/_astro/entry.js"></script>') },
      { '_astro/entry.js': 'export const load = () => import("./big.js");\n', '_astro/big.js': noise(MAX_FIRST_LOAD_BROTLI + 5_000) },
    );
    expect(r.err).toBe('');
    expect(r.status).toBe(0);
  });

  it('fails a page whose eager images are over the raw-byte budget', async () => {
    const r = await run(
      { 'index.html': html('<img src="/hero.png">') },
      { 'hero.png': noise(MAX_EAGER_IMAGE_BYTES + 1_000) },
    );
    expect(r.status).toBe(1);
    expect(r.err).toContain('Eager image budget exceeded: /');
  });

  it('does not count a loading="lazy" image', async () => {
    const r = await run(
      { 'index.html': html('<img src="/hero.png" loading="lazy">') },
      { 'hero.png': noise(MAX_EAGER_IMAGE_BYTES + 1_000) },
    );
    expect(r.err).toBe('');
    expect(r.status).toBe(0);
  });
});
